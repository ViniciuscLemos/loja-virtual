import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { SESSION_DURATION } from '../src/auth/sessions.js';
import { sessions, users } from '../src/db/schema.js';
import { APP_URL, register, setupDatabase } from './helpers.js';

const ctx = setupDatabase();

describe('register', () => {
  it('creates the account, logs in right away and does not return the password', async () => {
    const { agent, res } = await register(ctx.app, { email: 'Ana@Example.com ' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ name: 'Ana Souza', email: 'ana@example.com', role: 'customer' });
    expect(JSON.stringify(res.body)).not.toContain('password');

    const cookie = res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/session=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ana@example.com');
  });

  it('stores the password as a hash', async () => {
    await register(ctx.app);
    const [u] = await ctx.connection.db.select().from(users);
    expect(u!.passwordHash).not.toBe('strong-password-123');
    expect(u!.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it("doesn't allow the same email twice, even with uppercase", async () => {
    await register(ctx.app);
    const { res } = await register(ctx.app, { email: 'ANA@example.com' });
    expect(res.status).toBe(409);
  });

  it('validates the fields', async () => {
    const { res } = await register(ctx.app, { name: 'A', email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['email', 'name', 'password']);
  });
});

describe('login', () => {
  it('logs in with the right email and password', async () => {
    await register(ctx.app);
    const agent = request.agent(ctx.app);
    const res = await agent.post('/api/auth/login').send({ email: 'ana@example.com', password: 'strong-password-123' });
    expect(res.status).toBe(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
  });

  it('gives the same answer for a wrong password and for an email that does not exist', async () => {
    await register(ctx.app);
    const wrongPassword = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'wrong' });
    const noAccount = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' });

    expect(wrongPassword.status).toBe(401);
    expect(noAccount.status).toBe(401);
    expect(wrongPassword.body).toEqual(noAccount.body);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
  });

  it('blocks after too many attempts', async () => {
    const { createApp } = await import('../src/app.js');
    const app = createApp({ db: ctx.connection.db, appUrl: APP_URL, attemptLimit: 3 });
    const attempt = () => request(app).post('/api/auth/login').send({ email: 'x@x.com', password: 'wrong' });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(429);
  });
});

describe('session', () => {
  it("without a cookie you can't access /me", async () => {
    const res = await request(ctx.app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it("a made up cookie doesn't work", async () => {
    const res = await request(ctx.app).get('/api/auth/me').set('Cookie', 'session=made-up-token');
    expect(res.status).toBe(401);
  });

  it('only stores the token hash in the database', async () => {
    const { res } = await register(ctx.app);
    const token = /session=([^;]+)/.exec(res.headers['set-cookie']![0]!)![1]!;
    const [s] = await ctx.connection.db.select().from(sessions);
    expect(s!.id).not.toBe(token);
    expect(s!.id).toHaveLength(64);
  });

  it('logout ends the session on the server, not just deletes the cookie', async () => {
    const { agent, res } = await register(ctx.app);
    const cookie = res.headers['set-cookie']![0]!.split(';')[0]!;

    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect((await agent.get('/api/auth/me')).status).toBe(401);
    // even someone who copied the cookie before the logout can't use it anymore
    expect((await request(ctx.app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });

  it("an expired session doesn't work and gets deleted", async () => {
    const { agent } = await register(ctx.app);
    await ctx.connection.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });

    expect((await agent.get('/api/auth/me')).status).toBe(401);
    expect(await ctx.connection.db.select().from(sessions)).toHaveLength(0);
  });

  it('renews the session of someone who keeps using the store', async () => {
    const { agent } = await register(ctx.app);
    const almostExpired = new Date(Date.now() + SESSION_DURATION / 4);
    await ctx.connection.db.update(sessions).set({ expiresAt: almostExpired });

    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']![0]).toMatch(/session=/);
    const [s] = await ctx.connection.db.select().from(sessions);
    expect(s!.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_DURATION * 0.9);
  });

  it("deleting the user deletes their sessions", async () => {
    await register(ctx.app);
    await ctx.connection.db.delete(users).where(eq(users.email, 'ana@example.com'));
    expect(await ctx.connection.db.select().from(sessions)).toHaveLength(0);
  });
});

describe('general protections', () => {
  it('refuses a POST coming from another site', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', 'https://evil-site.com')
      .send({ email: 'ana@example.com', password: 'strong-password-123' });
    expect(res.status).toBe(403);
  });

  it("accepts a POST coming from the store's own front end", async () => {
    const { res } = await register(ctx.app);
    expect(res.status).toBe(201);
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', APP_URL)
      .send({ email: 'ana@example.com', password: 'strong-password-123' });
    expect(login.status).toBe(200);
  });

  it('broken json becomes 400 and not 500', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
  });

  it('a route that does not exist gives 404 in json', async () => {
    const res = await request(ctx.app).get('/api/nothing');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});
