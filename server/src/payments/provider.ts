import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';
import { HttpError } from '../lib/errors.js';

export interface CheckoutRequest {
  orderId: string;
  customerEmail: string;
  items: { name: string; unitPriceCents: number; quantity: number }[];
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
}

export type PaymentEvent = { type: 'paid' | 'expired'; paymentId: string } | { type: 'ignored' };

export interface PaymentProvider {
  kind: 'stripe' | 'demo';
  createCheckout(request: CheckoutRequest): Promise<{ id: string; url: string }>;
  // stops a checkout that won't be used anymore (the customer canceled the order)
  cancelCheckout(id: string): Promise<void>;
  // only Stripe has webhooks; the demo checkout calls the order functions directly
  parseWebhook?(rawBody: Buffer, signature: string | undefined): PaymentEvent;
}

// the part of the Stripe client used here, so the tests can pass a fake one
type StripeClient = Pick<Stripe, 'checkout' | 'webhooks'>;

export function stripeProvider(options: { secretKey: string; webhookSecret: string; client?: StripeClient }): PaymentProvider {
  const stripe: StripeClient = options.client ?? new Stripe(options.secretKey);

  return {
    kind: 'stripe',

    async createCheckout(req) {
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: req.customerEmail,
        client_reference_id: req.orderId,
        metadata: { orderId: req.orderId },
        line_items: req.items.map((item) => ({
          quantity: item.quantity,
          price_data: { currency: 'usd', unit_amount: item.unitPriceCents, product_data: { name: item.name } },
        })),
        success_url: req.successUrl,
        cancel_url: req.cancelUrl,
        expires_at: Math.floor(req.expiresAt.getTime() / 1000),
      });
      if (!session.url) throw new HttpError(502, 'Stripe did not return a payment page.');
      return { id: session.id, url: session.url };
    },

    async cancelCheckout(id) {
      // if it already expired or was paid, Stripe refuses, and that's fine
      await stripe.checkout.sessions.expire(id).catch(() => {});
    },

    parseWebhook(rawBody, signature) {
      let event: Stripe.Event;
      try {
        // checks the signature, so nobody can fake a "paid" event by calling the route directly
        event = stripe.webhooks.constructEvent(rawBody, signature ?? '', options.webhookSecret);
      } catch {
        throw new HttpError(400, 'Invalid webhook signature.');
      }

      switch (event.type) {
        case 'checkout.session.completed':
          // with some payment methods the money only arrives later (async_payment_succeeded)
          return event.data.object.payment_status === 'paid'
            ? { type: 'paid', paymentId: event.data.object.id }
            : { type: 'ignored' };
        case 'checkout.session.async_payment_succeeded':
          return { type: 'paid', paymentId: event.data.object.id };
        case 'checkout.session.expired':
        case 'checkout.session.async_payment_failed':
          return { type: 'expired', paymentId: event.data.object.id };
        default:
          return { type: 'ignored' };
      }
    },
  };
}

// Without Stripe keys the store uses a fake checkout page in the front end,
// so the whole flow (order, payment, email) can be tried without an account anywhere.
export function demoProvider(appUrl: string): PaymentProvider {
  return {
    kind: 'demo',
    async createCheckout() {
      const id = `demo_${randomBytes(12).toString('hex')}`;
      return { id, url: `${appUrl}/demo-checkout/${id}` };
    },
    async cancelCheckout() {},
  };
}
