import { and, count, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requireLogin, requireRole } from '../auth/middlewares.js';
import type { Db } from '../db/index.js';
import { orders, orderStatus, users } from '../db/schema.js';
import { HttpError, notFound } from '../lib/errors.js';
import type { PaymentProvider } from '../payments/provider.js';
import { withItems, type OrderService } from './service.js';

const idSchema = z.uuid('Invalid id.');

export function orderRoutes(db: Db, service: OrderService) {
  const r = Router();
  r.use(requireLogin);

  // checkout: turns the cart into an order and returns the payment page
  r.post('/', async (req, res) => {
    if (!req.user!.emailVerified) {
      throw new HttpError(403, 'Confirm your email before placing an order. Check your inbox.');
    }
    const order = await service.checkout(req.user!);
    res.status(201).json({ order, checkoutUrl: order.paymentUrl });
  });

  r.get('/', async (req, res) => {
    const list = await db.select().from(orders).where(eq(orders.userId, req.user!.id)).orderBy(desc(orders.createdAt));
    res.json({ orders: await withItems(db, list) });
  });

  r.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    // filtering by the user too: someone else's order id gives 404, not 403, so it doesn't even confirm it exists
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, req.user!.id)));
    if (!order) throw notFound('Order');
    res.json({ order: (await withItems(db, [order]))[0] });
  });

  r.post('/:id/cancel', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const [order] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.userId, req.user!.id)));
    if (!order) throw notFound('Order');
    const canceled = await service.cancel(req.user!.id, id);
    res.json({ order: (await withItems(db, [canceled]))[0] });
  });

  return r;
}

export function adminOrderRoutes(db: Db, service: OrderService) {
  const r = Router();
  r.use(requireRole('admin'));

  const listQuery = z.object({
    status: z.enum(orderStatus.enumValues).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(30),
  });

  r.get('/', async (req, res) => {
    const q = listQuery.parse(req.query);
    const where = q.status ? eq(orders.status, q.status) : undefined;
    const [list, counted] = await Promise.all([
      db
        .select({ order: orders, customer: { name: users.name, email: users.email } })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .where(where)
        .orderBy(desc(orders.createdAt))
        .limit(q.limit)
        .offset((q.page - 1) * q.limit),
      db.select({ total: count() }).from(orders).where(where),
    ]);
    const full = await withItems(
      db,
      list.map((row) => row.order),
    );
    const total = counted[0]?.total ?? 0;
    res.json({
      orders: full.map((o, i) => ({ ...o, customer: list[i]!.customer })),
      total,
      page: q.page,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    });
  });

  // the only manual change is "shipped"; paid and canceled come from the payment
  r.post('/:id/ship', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const shipped = await service.ship(id);
    res.json({ order: (await withItems(db, [shipped]))[0] });
  });

  return r;
}

// Stripe calls this route when a payment goes through or a checkout expires.
export function stripeWebhook(payments: PaymentProvider, service: OrderService) {
  return async (req: import('express').Request, res: import('express').Response) => {
    const event = payments.parseWebhook!(req.body as Buffer, req.get('stripe-signature'));
    if (event.type === 'paid') await service.markPaid(event.paymentId);
    if (event.type === 'expired') await service.markExpired(event.paymentId);
    res.json({ received: true });
  };
}

// Only exists in demo mode: the fake checkout page in the front end calls these.
export function demoCheckoutRoutes(db: Db, service: OrderService) {
  const r = Router();
  r.use(requireLogin);

  async function ownOrder(userId: string, paymentId: string) {
    const [order] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.paymentId, paymentId), eq(orders.userId, userId)));
    if (!order) throw notFound('Checkout');
    return order;
  }

  r.get('/:paymentId', async (req, res) => {
    const order = await ownOrder(req.user!.id, String(req.params.paymentId));
    res.json({ order: (await withItems(db, [order]))[0] });
  });

  r.post('/:paymentId/pay', async (req, res) => {
    const order = await ownOrder(req.user!.id, String(req.params.paymentId));
    if (order.status !== 'pending') throw new HttpError(409, 'This checkout was already closed.');
    res.json({ order: await service.markPaid(order.paymentId!) });
  });

  return r;
}
