import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Db } from '../db/index.js';
import { users } from '../db/schema.js';
import type { Mailer } from '../email/mailer.js';
import * as templates from '../email/templates.js';
import { HttpError } from '../lib/errors.js';
import { checkPassword, hashPassword, wasteTime } from '../lib/password.js';
import { SESSION_COOKIE, cookieOptions, requireLogin } from './middlewares.js';
import { createSession, endAllSessions, endSession, toPublic } from './sessions.js';
import { consumeToken, issueToken } from './tokens.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email.'));
const password = z.string().min(8, 'The password needs at least 8 characters.').max(72);

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short.').max(100),
  email,
  password,
});

const loginSchema = z.object({
  email,
  password: z.string().min(1).max(72),
});

const tokenSchema = z.object({ token: z.string().min(1).max(200) });
const resetSchema = z.object({ token: z.string().min(1).max(200), password });

interface AuthOptions {
  attemptLimit: number;
  mailer: Mailer;
  appUrl: string;
}

export function authRoutes(db: Db, { attemptLimit, mailer, appUrl }: AuthOptions) {
  const r = Router();

  // Stops people trying to guess passwords by brute force, and also stops
  // someone from using the "forgot password" form to flood a person's inbox
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: attemptLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Wait a few minutes and try again.' },
  });

  async function sendVerification(user: { id: string; name: string; email: string }) {
    const token = await issueToken(db, user.id, 'verify_email');
    await mailer.send(templates.verifyEmail(user.name, user.email, `${appUrl}/verify-email?token=${token}`));
  }

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
    // if the email fails the account still exists, and the person can ask for it again
    await sendVerification(created).catch((e) => console.error('Failed to send the confirmation email:', e));
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

  r.post('/verify-email', async (req, res) => {
    const { token } = tokenSchema.parse(req.body);
    const userId = await consumeToken(db, token, 'verify_email');
    if (!userId) throw new HttpError(400, 'This link is invalid or expired. Ask for a new one.');

    const [user] = await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    res.json({ user: toPublic(user!) });
  });

  r.post('/resend-verification', requireLogin, limiter, async (req, res) => {
    if (req.user!.emailVerified) throw new HttpError(400, 'Your email is already confirmed.');
    await sendVerification(req.user!);
    res.status(204).end();
  });

  r.post('/forgot-password', limiter, async (req, res) => {
    const data = z.object({ email }).parse(req.body);
    const [user] = await db.select().from(users).where(eq(users.email, data.email));
    if (user) {
      const token = await issueToken(db, user.id, 'reset_password');
      await mailer.send(templates.resetPassword(user.name, user.email, `${appUrl}/reset-password?token=${token}`));
    }
    // always the same answer, so the form doesn't tell who has an account
    res.status(204).end();
  });

  r.post('/reset-password', limiter, async (req, res) => {
    const data = resetSchema.parse(req.body);
    const userId = await consumeToken(db, data.token, 'reset_password');
    if (!userId) throw new HttpError(400, 'This link is invalid or expired. Ask for a new one.');

    // whoever had the reset link also had access to the email, so it counts as confirmed
    const [user] = await db
      .update(users)
      .set({ passwordHash: await hashPassword(data.password), emailVerifiedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    // if someone had stolen a session, it ends here
    await endAllSessions(db, userId);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    await mailer.send(templates.passwordChanged(user!.name, user!.email)).catch(() => {});
    res.status(204).end();
  });

  return r;
}
