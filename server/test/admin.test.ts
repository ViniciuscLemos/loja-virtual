import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeAdmin, register, setupDatabase } from './helpers.js';

const ctx = setupDatabase();

async function admin() {
  const account = await register(ctx.app, { name: 'Admin', email: 'admin@store.com' });
  await makeAdmin(ctx, 'admin@store.com');
  return account.agent;
}

describe('admin routes', () => {
  it('without login gives 401', async () => {
    expect((await request(ctx.app).get('/api/admin/users')).status).toBe(401);
  });

  it('a logged in customer gets 403', async () => {
    const { agent } = await register(ctx.app);
    expect((await agent.get('/api/admin/users')).status).toBe(403);
  });

  it('admin lists the users without exposing the password hash', async () => {
    const agent = await admin();
    await register(ctx.app);

    const res = await agent.get('/api/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.users.map((u: { email: string }) => u.email)).toEqual(['admin@store.com', 'ana@example.com']);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('admin promotes a customer, and the permission works right away', async () => {
    const agent = await admin();
    const customer = await register(ctx.app);
    const id = customer.res.body.user.id;

    expect((await customer.agent.get('/api/admin/users')).status).toBe(403);
    const res = await agent.patch(`/api/admin/users/${id}/role`).send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
    // same session as before, no need to log in again
    expect((await customer.agent.get('/api/admin/users')).status).toBe(200);
  });

  it('a demoted admin loses access right away', async () => {
    const agent = await admin();
    const other = await register(ctx.app, { email: 'other@store.com' });
    await makeAdmin(ctx, 'other@store.com');

    await agent.patch(`/api/admin/users/${other.res.body.user.id}/role`).send({ role: 'customer' });
    expect((await other.agent.get('/api/admin/users')).status).toBe(403);
  });

  it("admin can't change their own role", async () => {
    const agent = await admin();
    const me = await agent.get('/api/auth/me');
    const res = await agent.patch(`/api/admin/users/${me.body.user.id}/role`).send({ role: 'customer' });
    expect(res.status).toBe(400);
  });

  it('validates id and role', async () => {
    const agent = await admin();
    expect((await agent.patch('/api/admin/users/123/role').send({ role: 'admin' })).status).toBe(400);
    const { res } = await register(ctx.app);
    const id = res.body.user.id;
    expect((await agent.patch(`/api/admin/users/${id}/role`).send({ role: 'owner' })).status).toBe(400);
    expect(
      (await agent.patch('/api/admin/users/00000000-0000-4000-8000-000000000000/role').send({ role: 'admin' })).status,
    ).toBe(404);
  });
});
