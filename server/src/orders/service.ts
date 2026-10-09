import { and, asc, desc, eq, gte, inArray, lt, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { cartItems, orderItems, orders, products, users, type Order, type OrderItem } from '../db/schema.js';
import type { Mailer } from '../email/mailer.js';
import * as templates from '../email/templates.js';
import { HttpError } from '../lib/errors.js';
import type { PaymentProvider } from '../payments/provider.js';

// how long a pending order keeps the stock reserved (Stripe needs at least 30 minutes)
export const CHECKOUT_DURATION = 35 * 60 * 1000;

export type OrderWithItems = Order & { items: OrderItem[] };

export async function withItems(db: Db, list: Order[]): Promise<OrderWithItems[]> {
  if (list.length === 0) return [];
  const items = await db
    .select()
    .from(orderItems)
    .where(
      inArray(
        orderItems.orderId,
        list.map((o) => o.id),
      ),
    )
    .orderBy(asc(orderItems.name));
  return list.map((o) => ({ ...o, items: items.filter((i) => i.orderId === o.id) }));
}

// Turns the cart into an order and reserves the stock, all in one transaction.
// The stock is decreased with "where stock >= quantity", so two people buying the last
// unit at the same time can't both get it: the second update changes no row.
async function orderFromCart(db: Db, userId: string) {
  return db.transaction(async (tx) => {
    const cart = await tx
      .select({ product: products, quantity: cartItems.quantity })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.userId, userId))
      .orderBy(asc(products.name));
    if (cart.length === 0) throw new HttpError(400, 'Your cart is empty.');

    for (const { product, quantity } of cart) {
      if (!product.active) throw new HttpError(409, `${product.name} is no longer sold. Remove it from the cart.`);
      const [reserved] = await tx
        .update(products)
        .set({ stock: sql`${products.stock} - ${quantity}` })
        .where(and(eq(products.id, product.id), gte(products.stock, quantity)))
        .returning({ id: products.id });
      if (!reserved) {
        const left = product.stock > 0 ? `only ${product.stock} left` : "it's out of stock";
        throw new HttpError(409, `Not enough ${product.name} (${left}). Update your cart.`);
      }
    }

    const totalCents = cart.reduce((sum, { product, quantity }) => sum + product.priceCents * quantity, 0);
    const [order] = await tx.insert(orders).values({ userId, totalCents }).returning();
    const items = await tx
      .insert(orderItems)
      .values(
        cart.map(({ product, quantity }) => ({
          orderId: order!.id,
          productId: product.id,
          name: product.name,
          unitPriceCents: product.priceCents,
          quantity,
        })),
      )
      .returning();
    return { ...order!, items };
  });
}

// gives the reserved stock back; only acts on pending orders, so running it twice is harmless
async function releaseOrder(db: Db, where: SQL) {
  return db.transaction(async (tx) => {
    const [canceled] = await tx
      .update(orders)
      .set({ status: 'canceled', canceledAt: new Date(), paymentUrl: null })
      .where(and(where, eq(orders.status, 'pending')))
      .returning();
    if (!canceled) return null;

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, canceled.id));
    for (const item of items) {
      await tx
        .update(products)
        .set({ stock: sql`${products.stock} + ${item.quantity}` })
        .where(eq(products.id, item.productId));
    }
    return canceled;
  });
}

export function orderService(db: Db, payments: PaymentProvider, mailer: Mailer, appUrl: string) {
  return {
    async checkout(user: { id: string; email: string }) {
      const order = await orderFromCart(db, user.id);
      try {
        const session = await payments.createCheckout({
          orderId: order.id,
          customerEmail: user.email,
          items: order.items,
          successUrl: `${appUrl}/orders/${order.id}?paid=1`,
          cancelUrl: `${appUrl}/orders/${order.id}`,
          expiresAt: new Date(Date.now() + CHECKOUT_DURATION),
        });
        const [updated] = await db
          .update(orders)
          .set({ paymentId: session.id, paymentUrl: session.url })
          .where(eq(orders.id, order.id))
          .returning();
        return { ...updated!, items: order.items };
      } catch (e) {
        // the payment page couldn't be created: give the stock back and keep the cart as it was
        await releaseOrder(db, eq(orders.id, order.id));
        if (e instanceof HttpError) throw e;
        console.error('Failed to create the checkout:', e);
        throw new HttpError(502, "Couldn't open the payment page. Try again in a bit.");
      }
    },

    // Called by the Stripe webhook (or the demo checkout). Stripe can send the same event
    // more than once, so only a pending order changes, and only once.
    async markPaid(paymentId: string) {
      const [paid] = await db
        .update(orders)
        .set({ status: 'paid', paidAt: new Date(), paymentUrl: null })
        .where(and(eq(orders.paymentId, paymentId), eq(orders.status, 'pending')))
        .returning();
      if (!paid) return null;

      const [order] = await withItems(db, [paid]);
      // takes the bought items out of the cart (whatever was added later stays)
      await db.delete(cartItems).where(
        and(
          eq(cartItems.userId, paid.userId),
          inArray(
            cartItems.productId,
            order!.items.map((i) => i.productId),
          ),
        ),
      );
      const [user] = await db.select().from(users).where(eq(users.id, paid.userId));
      await mailer.send(templates.orderConfirmation(user!.name, user!.email, order!, appUrl)).catch((e) => {
        console.error('Failed to send the order email:', e);
      });
      return order!;
    },

    markExpired: (paymentId: string) => releaseOrder(db, eq(orders.paymentId, paymentId)),

    async cancel(userId: string, orderId: string) {
      const canceled = await releaseOrder(db, and(eq(orders.id, orderId), eq(orders.userId, userId))!);
      if (!canceled) throw new HttpError(409, 'Only pending orders can be canceled.');
      if (canceled.paymentId) await payments.cancelCheckout(canceled.paymentId);
      return canceled;
    },

    async ship(orderId: string) {
      const [shipped] = await db
        .update(orders)
        .set({ status: 'shipped', shippedAt: new Date() })
        .where(and(eq(orders.id, orderId), eq(orders.status, 'paid')))
        .returning();
      if (!shipped) throw new HttpError(409, 'Only paid orders can be marked as shipped.');
      const [user] = await db.select().from(users).where(eq(users.id, shipped.userId));
      await mailer.send(templates.orderShipped(user!.name, user!.email, shipped, appUrl)).catch(() => {});
      return shipped;
    },

    // Pending orders whose checkout already ran out. With Stripe the "expired" webhook
    // takes care of it, this is a safety net (and what cleans up the demo checkout).
    async expireStale() {
      const stale = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.status, 'pending'), lt(orders.createdAt, new Date(Date.now() - CHECKOUT_DURATION))))
        .orderBy(desc(orders.createdAt));
      for (const { id } of stale) await releaseOrder(db, eq(orders.id, id));
      return stale.length;
    },
  };
}

export type OrderService = ReturnType<typeof orderService>;
