import { eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { sessions, users, type User } from '../db/schema.js';
import { generateToken, hashToken } from '../lib/token.js';

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_DURATION = 30 * DAY;

export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'role'> & {
  emailVerified: boolean;
};

export function toPublic(u: User): PublicUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    emailVerified: u.emailVerifiedAt !== null,
  };
}

export async function createSession(db: Db, userId: string) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

// Returns the user who owns the token, or null if the session doesn't exist or expired.
// If less than half the time is left, the session is renewed: people who use the store
// often don't have to keep logging in again.
export async function validateSession(db: Db, token: string) {
  const id = hashToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id));
  if (!row) return null;

  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  let expiresAt = row.session.expiresAt;
  if (expiresAt.getTime() - now < SESSION_DURATION / 2) {
    expiresAt = new Date(now + SESSION_DURATION);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
  }

  return { user: row.user, expiresAt, renewed: expiresAt !== row.session.expiresAt };
}

export async function endSession(db: Db, token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function endAllSessions(db: Db, userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
