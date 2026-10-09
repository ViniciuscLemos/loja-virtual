import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app.js';
import { connectPglite, type Connection } from '../src/db/index.js';
import { users } from '../src/db/schema.js';

export const APP_URL = 'http://localhost:5173';

// Each test file gets an in-memory Postgres (PGlite) with the migrations
// applied, and the tables are cleaned before each test.
export function setupDatabase() {
  const ctx = {} as { connection: Connection; app: ReturnType<typeof createApp> };

  beforeAll(async () => {
    ctx.connection = connectPglite();
    await ctx.connection.migrate();
    ctx.app = createApp({ db: ctx.connection.db, appUrl: APP_URL, attemptLimit: 1000 });
  });

  beforeEach(async () => {
    await ctx.connection.db.execute(sql`truncate table users cascade`);
  });

  afterAll(async () => {
    await ctx.connection.close();
  });

  return ctx;
}

// supertest.agent keeps the cookies between requests, like a browser
export async function register(
  app: ReturnType<typeof createApp>,
  data: Partial<{ name: string; email: string; password: string }> = {},
) {
  const agent = request.agent(app);
  const body = { name: 'Ana Souza', email: 'ana@example.com', password: 'strong-password-123', ...data };
  const res = await agent.post('/api/auth/register').send(body);
  return { agent, res, ...body };
}

export async function makeAdmin(ctx: { connection: Connection }, email: string) {
  await ctx.connection.db.update(users).set({ role: 'admin' }).where(eq(users.email, email));
}
