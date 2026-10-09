import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { adminRoutes } from './admin/routes.js';
import { loadUser } from './auth/middlewares.js';
import { authRoutes } from './auth/routes.js';
import type { Db } from './db/index.js';
import { HttpError, handleErrors } from './lib/errors.js';

export interface AppOptions {
  db: Db;
  appUrl: string;
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

export function createApp({ db, appUrl, attemptLimit = 10 }: AppOptions) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', checkOrigin(appUrl), loadUser(db));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', authRoutes(db, { attemptLimit }));
  app.use('/api/admin', adminRoutes(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Route not found.' });
  });
  app.use(handleErrors);
  return app;
}
