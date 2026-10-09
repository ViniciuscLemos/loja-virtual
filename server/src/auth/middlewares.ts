import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { isProduction } from '../config.js';
import type { Db } from '../db/index.js';
import type { Role } from '../db/schema.js';
import { forbidden, notAuthenticated } from '../lib/errors.js';
import { toPublic, validateSession, type PublicUser } from './sessions.js';

declare global {
  namespace Express {
    interface Request {
      user?: PublicUser;
      sessionToken?: string;
    }
  }
}

export const SESSION_COOKIE = 'session';

// httpOnly: the page's JavaScript can't read the cookie (protects against XSS)
// sameSite lax: the browser doesn't send the cookie on a POST coming from another site (CSRF)
export const cookieOptions = (expiresAt: Date): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: isProduction,
  path: '/',
  expires: expiresAt,
});

export function loadUser(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token: string | undefined = req.cookies?.[SESSION_COOKIE];
    if (!token) return next();

    const session = await validateSession(db, token);
    if (!session) {
      res.clearCookie(SESSION_COOKIE, { path: '/' });
      return next();
    }

    req.user = toPublic(session.user);
    req.sessionToken = token;
    if (session.renewed) res.cookie(SESSION_COOKIE, token, cookieOptions(session.expiresAt));
    next();
  };
}

export function requireLogin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) throw notAuthenticated();
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw notAuthenticated();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };
}
