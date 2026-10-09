import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import { HttpError } from '../lib/errors.js';
import { checkPassword, hashPassword, wasteTime } from '../lib/password.js';
import { SESSION_COOKIE, cookieOptions, requireLogin } from './middlewares.js';
import { createSession, endSession, toPublic } from './sessions.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email.'));

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short.').max(100),
  email,
  password: z.string().min(8, 'The password needs at least 8 characters.').max(72),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

export function authRoutes(db: Db, options: { attemptLimit: number }) {
  const r = Router();

  // Stops people trying to guess passwords by brute force
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: options.attemptLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Wait a few minutes and try again.' },
  });

  r.post('/register', limiter, async (req, res) => {
    const data = registerSchema.parse(req.body);

    const [created] = await db
      .insert(users)
      .values({ name: data.name, email: data.email, passwordHash: await hashPassword(data.password) })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!created) throw new HttpError(409, 'There is already an account with this email.');

    const session = await createSession(db, created.id);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    res.status(201).json({ user: toPublic(created) });
  });

  r.post('/login', limiter, async (req, res) => {
    const data = loginSchema.parse(req.body);

    const [user] = await db.select().from(users).where(eq(users.email, data.email));
    const passwordOk = user ? await checkPassword(data.password, user.passwordHash) : await wasteTime(data.password);
    // same message for both cases, so it doesn't reveal whether the email has an account
    if (!user || !passwordOk) throw new HttpError(401, 'Wrong email or password.');

    const session = await createSession(db, user.id);
    res.cookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    res.json({ user: toPublic(user) });
  });

  r.post('/logout', async (req, res) => {
    if (req.sessionToken) await endSession(db, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  r.get('/me', requireLogin, (req, res) => {
    res.json({ user: req.user });
  });

  return r;
}
