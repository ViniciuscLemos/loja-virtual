import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { orders, products } from '../src/db/schema.js';
import { stripeProvider } from '../src/payments/provider.js';
import { setupDatabase, verifiedCustomer } from './helpers.js';

// The real Stripe library checks the signatures, only the call that creates
// the checkout is fake (so the tests don't need the internet or an account).
const WEBHOOK_SECRET = 'whsec_test_secret';
const realStripe = new Stripe('sk_test_fake');
const create = vi.fn(async (params: Stripe.Checkout.SessionCreateParams) => ({
  id: `cs_test_${Math.random().toString(36).slice(2)}`,
  url: 'https://checkout.stripe.com/c/pay/test',
  params,
}));
const expire = vi.fn(async () => ({}));
const fakeClient = {
  checkout: { sessions: { create, expire } },
  webhooks: realStripe.webhooks,
} as unknown as Pick<Stripe, 'checkout' | 'webhooks'>;

const ctx = setupDatabase({
  payments: () => stripeProvider({ secretKey: 'sk_test_fake', webhookSecret: WEBHOOK_SECRET, client: fakeClient }),
});

function signedEvent(type: string, object: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify({ id: 'evt_test', object: 'event', type, data: { object } });
  const signature = realStripe.webhooks.generateTestHeaderString({ payload, secret });
  return request(ctx.app)
    .post('/api/webhooks/stripe')
    .set('Content-Type', 'application/json')
    .set('Stripe-Signature', signature)
    .send(payload);
}

async function pendingOrder() {
  const customer = await verifiedCustomer(ctx);
  const [mug] = await ctx.connection.db
    .insert(products)
    .values({ name: 'Blue Mug', slug: 'blue-mug', category: 'Mugs', priceCents: 1500, stock: 5 })
    .returning();
  await customer.agent.put(`/api/cart/items/${mug!.id}`).send({ quantity: 2 });
  const res = await customer.agent.post('/api/orders');
  return { ...customer, mug: mug!, order: res.body.order, checkoutUrl: res.body.checkoutUrl };
}

const stockOf = async (id: string) =>
  (await ctx.connection.db.select().from(products).where(eq(products.id, id)))[0]!.stock;

describe('Stripe checkout', () => {
  it('creates the checkout session with the items, the email and the order id', async () => {
    const { order, checkoutUrl } = await pendingOrder();
    expect(checkoutUrl).toBe('https://checkout.stripe.com/c/pay/test');

    const params = create.mock.lastCall![0];
    expect(params).toMatchObject({
      mode: 'payment',
      customer_email: 'ana@example.com',
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      line_items: [{ quantity: 2, price_data: { currency: 'usd', unit_amount: 1500, product_data: { name: 'Blue Mug' } } }],
    });
    // Stripe needs the expiration at least 30 minutes ahead
    expect(params.expires_at! * 1000 - Date.now()).toBeGreaterThan(30 * 60 * 1000);
  });

  it('if Stripe fails, the order is canceled and the stock comes back', async () => {
    create.mockRejectedValueOnce(new Error('stripe is down'));
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mug, agent } = await pendingOrder();
    errors.mockRestore();

    expect(await stockOf(mug.id)).toBe(5);
    const [order] = await ctx.connection.db.select().from(orders);
    expect(order!.status).toBe('canceled');
    expect((await agent.get('/api/cart')).body.items).toHaveLength(1);
  });

  it('canceling the order also expires the session on Stripe', async () => {
    const { agent, order } = await pendingOrder();
    await agent.post(`/api/orders/${order.id}/cancel`);
    expect(expire).toHaveBeenCalledWith(order.paymentId);
  });

  it("the demo checkout routes don't exist with Stripe", async () => {
    const { agent, order } = await pendingOrder();
    expect((await agent.post(`/api/demo-checkout/${order.paymentId}/pay`)).status).toBe(404);
  });
});

describe('Stripe webhook', () => {
  it('a paid checkout marks the order as paid', async () => {
    const { order, agent } = await pendingOrder();
    const res = await signedEvent('checkout.session.completed', {
      id: order.paymentId,
      object: 'checkout.session',
      payment_status: 'paid',
    });
    expect(res.status).toBe(200);
    expect((await agent.get(`/api/orders/${order.id}`)).body.order.status).toBe('paid');
  });

  it('a completed checkout that is not paid yet waits for async_payment_succeeded', async () => {
    const { order, agent } = await pendingOrder();
    await signedEvent('checkout.session.completed', { id: order.paymentId, payment_status: 'unpaid' });
    expect((await agent.get(`/api/orders/${order.id}`)).body.order.status).toBe('pending');

    await signedEvent('checkout.session.async_payment_succeeded', { id: order.paymentId });
    expect((await agent.get(`/api/orders/${order.id}`)).body.order.status).toBe('paid');
  });

  it('an expired checkout cancels the order and gives the stock back', async () => {
    const { order, mug, agent } = await pendingOrder();
    await signedEvent('checkout.session.expired', { id: order.paymentId });
    expect((await agent.get(`/api/orders/${order.id}`)).body.order.status).toBe('canceled');
    expect(await stockOf(mug.id)).toBe(5);
  });

  it('refuses events without a valid signature', async () => {
    const { order, agent } = await pendingOrder();
    const forged = await signedEvent(
      'checkout.session.completed',
      { id: order.paymentId, payment_status: 'paid' },
      'whsec_someone_else',
    );
    expect(forged.status).toBe(400);

    const unsigned = await request(ctx.app)
      .post('/api/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .send({ type: 'checkout.session.completed', data: { object: { id: order.paymentId, payment_status: 'paid' } } });
    expect(unsigned.status).toBe(400);
    expect((await agent.get(`/api/orders/${order.id}`)).body.order.status).toBe('pending');
  });

  it('other event types are accepted and ignored', async () => {
    const res = await signedEvent('customer.created', { id: 'cus_test' });
    expect(res.status).toBe(200);
  });
});
