import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { authTokens, sessions } from '../src/db/schema.js';
import { APP_URL, linkFromEmail, register, setupDatabase } from './helpers.js';

const ctx = setupDatabase();

describe('email confirmation', () => {
  it('sign up sends an email with a link to the front end', async () => {
    const { res } = await register(ctx.app);
    expect(res.body.user.emailVerified).toBe(false);

    const [email] = ctx.mailer.inbox!('ana@example.com');
    expect(email!.subject).toBe('Confirm your email');
    expect(email!.html).toContain('Ana Souza');
    expect(linkFromEmail(ctx.mailer, 'ana@example.com').url).toMatch(new RegExp(`^${APP_URL}/verify-email\\?token=`));
  });

  it('the link confirms the email', async () => {
    const { agent } = await register(ctx.app);
    const { token } = linkFromEmail(ctx.mailer, 'ana@example.com');

    const res = await request(ctx.app).post('/api/auth/verify-email').send({ token });
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
    expect((await agent.get('/api/auth/me')).body.user.emailVerified).toBe(true);
  });

  it('the link only works once', async () => {
    await register(ctx.app);
    const { token } = linkFromEmail(ctx.mailer, 'ana@example.com');

    expect((await request(ctx.app).post('/api/auth/verify-email').send({ token })).status).toBe(200);
    expect((await request(ctx.app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
  });

  it('a made up or expired token does not work', async () => {
    await register(ctx.app);
    const { token } = linkFromEmail(ctx.mailer, 'ana@example.com');
    await ctx.connection.db.update(authTokens).set({ expiresAt: new Date(Date.now() - 1000) });

    expect((await request(ctx.app).post('/api/auth/verify-email').send({ token })).status).toBe(400);
    expect((await request(ctx.app).post('/api/auth/verify-email').send({ token: 'made-up' })).status).toBe(400);
  });

  it('asking for a new email makes the old link stop working', async () => {
    const { agent } = await register(ctx.app);
    const old = linkFromEmail(ctx.mailer, 'ana@example.com').token;

    expect((await agent.post('/api/auth/resend-verification')).status).toBe(204);
    const fresh = linkFromEmail(ctx.mailer, 'ana@example.com').token;
    expect(fresh).not.toBe(old);

    expect((await request(ctx.app).post('/api/auth/verify-email').send({ token: old })).status).toBe(400);
    expect((await request(ctx.app).post('/api/auth/verify-email').send({ token: fresh })).status).toBe(200);
    // already confirmed, there's nothing to resend
    expect((await agent.post('/api/auth/resend-verification')).status).toBe(400);
  });

  it('the database only keeps the token hash', async () => {
    await register(ctx.app);
    const { token } = linkFromEmail(ctx.mailer, 'ana@example.com');
    const [row] = await ctx.connection.db.select().from(authTokens);
    expect(row!.id).not.toBe(token);
    expect(row!.id).toHaveLength(64);
  });
});

describe('password reset', () => {
  it('gives the same answer whether the email exists or not, and only sends to real accounts', async () => {
    await register(ctx.app);
    const before = ctx.mailer.inbox!('nobody@example.com').length;

    const existing = await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'ana@example.com' });
    const missing = await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(existing.status).toBe(204);
    expect(missing.status).toBe(204);

    expect(ctx.mailer.inbox!('ana@example.com')[0]!.subject).toBe('Reset your password');
    expect(ctx.mailer.inbox!('nobody@example.com')).toHaveLength(before);
  });

  it('resets the password, ends every session and the old password stops working', async () => {
    const { agent } = await register(ctx.app);
    await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'ana@example.com' });
    const { url, token } = linkFromEmail(ctx.mailer, 'ana@example.com');
    expect(url).toContain(`${APP_URL}/reset-password?token=`);

    const res = await request(ctx.app)
      .post('/api/auth/reset-password')
      .send({ token, password: 'brand-new-password' });
    expect(res.status).toBe(204);

    expect(await ctx.connection.db.select().from(sessions)).toHaveLength(0);
    expect((await agent.get('/api/auth/me')).status).toBe(401);

    const oldLogin = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'strong-password-123' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ana@example.com', password: 'brand-new-password' });
    expect(newLogin.status).toBe(200);
    // the reset link proves access to the email
    expect(newLogin.body.user.emailVerified).toBe(true);
    expect(ctx.mailer.inbox!('ana@example.com')[0]!.subject).toBe('Your password was changed');
  });

  it('the reset link only works once and validates the new password', async () => {
    await register(ctx.app);
    await request(ctx.app).post('/api/auth/forgot-password').send({ email: 'ana@example.com' });
    const { token } = linkFromEmail(ctx.mailer, 'ana@example.com');

    const short = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: '123' });
    expect(short.status).toBe(400);

    const ok = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'brand-new-password' });
    expect(ok.status).toBe(204);
    const again = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'another-password' });
    expect(again.status).toBe(400);
  });

  it("a confirmation token can't be used to reset the password", async () => {
    await register(ctx.app);
    const { token } = linkFromEmail(ctx.mailer, 'ana@example.com');
    const res = await request(ctx.app).post('/api/auth/reset-password').send({ token, password: 'brand-new-password' });
    expect(res.status).toBe(400);
  });
});

describe('demo inbox', () => {
  it('only shows the emails of the logged in person', async () => {
    const ana = await register(ctx.app);
    await register(ctx.app, { name: 'Bia', email: 'bia@example.com' });

    expect((await request(ctx.app).get('/api/inbox')).status).toBe(401);
    const res = await ana.agent.get('/api/inbox');
    expect(res.status).toBe(200);
    expect(res.body.emails.length).toBeGreaterThan(0);
    expect(res.body.emails.every((e: { to: string }) => e.to === 'ana@example.com')).toBe(true);
  });
});
