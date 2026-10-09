import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { adminRoutes } from './admin/routes.js';
import { loadUser, requireLogin } from './auth/middlewares.js';
import { authRoutes } from './auth/routes.js';
import { cartRoutes } from './cart/routes.js';
import type { Db } from './db/index.js';
import type { Mailer } from './email/mailer.js';
import { HttpError, handleErrors, notFound } from './lib/errors.js';
import { adminOrderRoutes, demoCheckoutRoutes, orderRoutes, stripeWebhook } from './orders/routes.js';
import { orderService } from './orders/service.js';
import type { PaymentProvider } from './payments/provider.js';
import { adminProductRoutes, productRoutes } from './products/routes.js';

export interface AppOptions {
  db: Db;
  appUrl: string;
  mailer: Mailer;
  payments: PaymentProvider;
  attemptLimit?: number;
}

// Second layer against CSRF (the first one is the cookie's sameSite):
// a request that changes data coming from another site is refused.
function checkOrigin(appUrl: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (req.method !== 'GET' && req.method !== 'HEAD' && origin && origin !== appUrl) {
      throw new HttpError(403, 'Origin not allowed.');
    }
    next();
  };
}

export function createApp({ db, appUrl, mailer, payments, attemptLimit = 10 }: AppOptions) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());

  const orders = orderService(db, payments, mailer, appUrl);

  // the webhook needs the raw body to check Stripe's signature, so it comes before express.json
  if (payments.parseWebhook) {
    app.post('/api/webhooks/stripe', express.raw({ type: 'application/json', limit: '1mb' }), stripeWebhook(payments, orders));
  }

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', checkOrigin(appUrl), loadUser(db));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  // tells the front end which parts are running in demo mode
  app.get('/api/config', (_req, res) => {
    res.json({ email: mailer.kind, payments: payments.kind });
  });

  app.use('/api/auth', authRoutes(db, { attemptLimit, mailer, appUrl }));
  app.get('/api/inbox', requireLogin, (req, res) => {
    if (!mailer.inbox) throw notFound('Inbox');
    res.json({ emails: mailer.inbox(req.user!.email) });
  });

  app.use('/api/products', productRoutes(db));
  app.use('/api/cart', cartRoutes(db));
  app.use('/api/orders', orderRoutes(db, orders));
  if (payments.kind === 'demo') app.use('/api/demo-checkout', demoCheckoutRoutes(db, orders));

  app.use('/api/admin/products', adminProductRoutes(db));
  app.use('/api/admin/orders', adminOrderRoutes(db, orders));
  app.use('/api/admin', adminRoutes(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route not found.' });
  });
  app.use(handleErrors);

  // server.ts uses the order service to clean up old pending orders
  return Object.assign(app, { orders });
}
