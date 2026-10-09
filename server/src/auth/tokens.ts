import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { authTokens, type TokenType } from '../db/schema.js';
import { generateToken, hashToken } from '../lib/token.js';

const HOUR = 60 * 60 * 1000;
export const TOKEN_DURATION: Record<TokenType, number> = {
  verify_email: 24 * HOUR,
  reset_password: HOUR,
};

// Creates a new token and deletes the older ones of the same type,
// so only the link from the most recent email works.
export async function issueToken(db: Db, userId: string, type: TokenType) {
  const token = generateToken();
  await db.transaction(async (tx) => {
    await tx.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.type, type)));
    await tx.insert(authTokens).values({
      id: hashToken(token),
      userId,
      type,
      expiresAt: new Date(Date.now() + TOKEN_DURATION[type]),
    });
  });
  return token;
}

// Uses up the token: returns the user id and deletes it, or null if it's invalid or expired.
// The delete with returning makes it single use even with two requests at the same time.
export async function consumeToken(db: Db, token: string, type: TokenType) {
  const [row] = await db
    .delete(authTokens)
    .where(and(eq(authTokens.id, hashToken(token)), eq(authTokens.type, type)))
    .returning();
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;
  return row.userId;
}
