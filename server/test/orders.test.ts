import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { cartItems, orders, products } from '../src/db/schema.js';
import { CHECKOUT_DURATION } from '../src/orders/service.js';
import { makeAdmin, register, setupDatabase, verifiedCustomer } from './helpers.js';

const ctx = setupDatabase();

async function product(data: Partial<{ name: string; priceCents: number; stock: number; active: boolean }> = {}) {
  const name = data.name ?? 'Blue Mug';
  const [p] = await ctx.connection.db
    .insert(products)
    .values({ name, slug: name.toLowerCase().replace(/\W+/g, '-'), category: 'Mugs', priceCents: 1500, stock: 10, ...data })
    .returning();
  return p!;
}

const stockOf = async (id: string) =>
  (await ctx.connection.db.select().from(products).where(eq(products.id, id)))[0]!.stock;

describe('cart', () => {
  it('needs login', async () => {
    expect((await request(ctx.app).get('/api/cart')).status).toBe(401);
  });

  it('adds, changes and removes items, with the subtotal', async () => {
    const { agent } = await register(ctx.app);
    const mug = await product();
    const shirt = await product({ name: 'Shirt', priceCents: 3000 });

    await agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 2 });
    const res = await agent.put(`/api/cart/items/${shirt.id}`).send({ quantity: 1 });
    expect(res.status).toBe(200);
    expect(res.body.subtotalCents).toBe(2 * 1500 + 3000);
    expect(res.body.count).toBe(3);

    const changed = await agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 1 });
    expect(changed.body.subtotalCents).toBe(4500);

    const removed = await agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 0 });
    expect(removed.body.items.map((i: { product: { name: string } }) => i.product.name)).toEqual(['Shirt']);

    expect((await agent.delete('/api/cart')).body.items).toEqual([]);
  });

  it("doesn't take more than the stock or archived products", async () => {
    const { agent } = await register(ctx.app);
    const few = await product({ stock: 2 });
    const archived = await product({ name: 'Old', active: false });

    const tooMany = await agent.put(`/api/cart/items/${few.id}`).send({ quantity: 3 });
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.error).toContain('Only 2 left');
    expect((await agent.put(`/api/cart/items/${archived.id}`).send({ quantity: 1 })).status).toBe(404);
    expect((await agent.put(`/api/cart/items/${few.id}`).send({ quantity: 1.5 })).status).toBe(400);
  });

  it('each person only sees their own cart', async () => {
    const ana = await register(ctx.app);
    const bia = await register(ctx.app, { email: 'bia@example.com' });
    const mug = await product();
    await ana.agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 1 });
    expect((await bia.agent.get('/api/cart')).body.items).toEqual([]);
  });
});

describe('checkout', () => {
  it('needs a confirmed email', async () => {
    const { agent } = await register(ctx.app);
    const mug = await product();
    await agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 1 });
    const res = await agent.post('/api/orders');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Confirm your email');
  });

  it('an empty cart gives 400', async () => {
    const { agent } = await verifiedCustomer(ctx);
    expect((await agent.post('/api/orders')).status).toBe(400);
  });

  it('creates a pending order, reserves the stock and returns the payment page', async () => {
    const { agent } = await verifiedCustomer(ctx);
    const mug = await product({ stock: 5 });
    await agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 2 });

    const res = await agent.post('/api/orders');
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ status: 'pending', totalCents: 3000 });
    expect(res.body.order.items).toEqual([
      expect.objectContaining({ name: 'Blue Mug', unitPriceCents: 1500, quantity: 2 }),
    ]);
    expect(res.body.checkoutUrl).toMatch(/\/demo-checkout\/demo_/);
    expect(await stockOf(mug.id)).toBe(3);
    // the cart only empties after the payment
    expect((await agent.get('/api/cart')).body.items).toHaveLength(1);
  });

  it('the order keeps the price it was bought for', async () => {
    const { agent } = await verifiedCustomer(ctx);
    const mug = await product();
    await agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 1 });
    const { body } = await agent.post('/api/orders');

    await ctx.connection.db.update(products).set({ priceCents: 9999, name: 'Renamed' });
    const order = await agent.get(`/api/orders/${body.order.id}`);
    expect(order.body.order.items[0]).toMatchObject({ name: 'Blue Mug', unitPriceCents: 1500 });
  });

  it('refuses the order if the stock ran out in the meantime, and changes nothing', async () => {
    const { agent } = await verifiedCustomer(ctx);
    const mug = await product({ stock: 3 });
    const shirt = await product({ name: 'Shirt', stock: 3 });
    await agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 2 });
    await agent.put(`/api/cart/items/${shirt.id}`).send({ quantity: 2 });
    // someone else bought the shirts after they went into the cart
    await ctx.connection.db.update(products).set({ stock: 1 }).where(eq(products.id, shirt.id));

    const res = await agent.post('/api/orders');
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Not enough Shirt (only 1 left)');
    // the transaction rolled back: the mugs were not reserved either
    expect(await stockOf(mug.id)).toBe(3);
    expect(await ctx.connection.db.select().from(orders)).toHaveLength(0);
  });

  it('two people buying the last unit: only one gets it', async () => {
    const ana = await verifiedCustomer(ctx);
    const bia = await verifiedCustomer(ctx, { email: 'bia@example.com' });
    const last = await product({ stock: 1 });
    await ana.agent.put(`/api/cart/items/${last.id}`).send({ quantity: 1 });
    await bia.agent.put(`/api/cart/items/${last.id}`).send({ quantity: 1 });

    const results = await Promise.all([ana.agent.post('/api/orders'), bia.agent.post('/api/orders')]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await stockOf(last.id)).toBe(0);
  });
});

describe('payment', () => {
  async function pendingOrder(quantity = 2) {
    const customer = await verifiedCustomer(ctx);
    const mug = await product({ stock: 5 });
    await customer.agent.put(`/api/cart/items/${mug.id}`).send({ quantity });
    const { body } = await customer.agent.post('/api/orders');
    return { ...customer, mug, order: body.order };
  }

  it('paying marks the order as paid, empties the cart and sends the email', async () => {
    const { agent, mug, order } = await pendingOrder();

    const res = await agent.post(`/api/demo-checkout/${order.paymentId}/pay`);
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('paid');
    expect(await stockOf(mug.id)).toBe(3);
    expect((await agent.get('/api/cart')).body.items).toEqual([]);

    const [email] = ctx.mailer.inbox!('ana@example.com');
    expect(email!.subject).toMatch(/^Order #\w{8} confirmed$/);
    expect(email!.text).toContain('2x Blue Mug: $30.00');
  });

  it('a payment confirmed twice only counts once', async () => {
    const { order } = await pendingOrder();
    const confirmations = () => ctx.mailer.inbox!('ana@example.com').filter((e) => e.subject.includes('confirmed')).length;
    const before = confirmations();
    const first = await ctx.app.orders.markPaid(order.paymentId);
    const second = await ctx.app.orders.markPaid(order.paymentId);
    expect(first?.status).toBe('paid');
    expect(second).toBeNull();
    expect(confirmations()).toBe(before + 1);
  });

  it('an expired checkout cancels the order and gives the stock back', async () => {
    const { agent, mug, order } = await pendingOrder();
    await ctx.app.orders.markExpired(order.paymentId);

    expect((await agent.get(`/api/orders/${order.id}`)).body.order.status).toBe('canceled');
    expect(await stockOf(mug.id)).toBe(5);
    // a late payment for an expired checkout doesn't revive it
    expect(await ctx.app.orders.markPaid(order.paymentId)).toBeNull();
  });

  it('the customer can cancel a pending order', async () => {
    const { agent, mug, order } = await pendingOrder();
    const res = await agent.post(`/api/orders/${order.id}/cancel`);
    expect(res.body.order.status).toBe('canceled');
    expect(await stockOf(mug.id)).toBe(5);
    expect((await agent.post(`/api/orders/${order.id}/cancel`)).status).toBe(409);
  });

  it('pending orders older than the checkout time expire on their own', async () => {
    const { mug, order } = await pendingOrder();
    await ctx.connection.db
      .update(orders)
      .set({ createdAt: new Date(Date.now() - CHECKOUT_DURATION - 1000) })
      .where(eq(orders.id, order.id));

    expect(await ctx.app.orders.expireStale()).toBe(1);
    expect(await stockOf(mug.id)).toBe(5);
  });

  it("nobody pays, sees or cancels someone else's order", async () => {
    const { order } = await pendingOrder();
    const bia = await register(ctx.app, { email: 'bia@example.com' });

    expect((await bia.agent.get(`/api/orders/${order.id}`)).status).toBe(404);
    expect((await bia.agent.post(`/api/orders/${order.id}/cancel`)).status).toBe(404);
    expect((await bia.agent.post(`/api/demo-checkout/${order.paymentId}/pay`)).status).toBe(404);
    expect((await bia.agent.get('/api/orders')).body.orders).toEqual([]);
  });

  it('deleting a product from the cart does not touch the order', async () => {
    const { agent, mug, order } = await pendingOrder();
    await agent.post(`/api/demo-checkout/${order.paymentId}/pay`);
    await ctx.connection.db.delete(cartItems).where(eq(cartItems.productId, mug.id));
    const list = await agent.get('/api/orders');
    expect(list.body.orders[0].items[0].name).toBe('Blue Mug');
  });
});

describe('admin orders', () => {
  it('lists every order with the customer, filters by status and ships paid ones', async () => {
    const customer = await verifiedCustomer(ctx);
    const mug = await product();
    await customer.agent.put(`/api/cart/items/${mug.id}`).send({ quantity: 1 });
    const { body } = await customer.agent.post('/api/orders');

    const admin = await register(ctx.app, { email: 'admin@store.com' });
    await makeAdmin(ctx, 'admin@store.com');
    expect((await customer.agent.get('/api/admin/orders')).status).toBe(403);

    const list = await admin.agent.get('/api/admin/orders?status=pending');
    expect(list.body.orders[0]).toMatchObject({ id: body.order.id, customer: { email: 'ana@example.com' } });

    // can't ship before it's paid
    expect((await admin.agent.post(`/api/admin/orders/${body.order.id}/ship`)).status).toBe(409);
    await customer.agent.post(`/api/demo-checkout/${body.order.paymentId}/pay`);
    const shipped = await admin.agent.post(`/api/admin/orders/${body.order.id}/ship`);
    expect(shipped.body.order.status).toBe('shipped');
    expect(ctx.mailer.inbox!('ana@example.com')[0]!.subject).toMatch(/shipped$/);
  });
});
