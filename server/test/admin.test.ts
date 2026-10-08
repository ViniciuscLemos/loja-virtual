import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { cadastrar, prepararBanco, tornarAdmin } from './ajuda.js';

const ctx = prepararBanco();

async function admin() {
  const conta = await cadastrar(ctx.app, { nome: 'Admin', email: 'admin@loja.com' });
  await tornarAdmin(ctx, 'admin@loja.com');
  return conta.agente;
}

describe('rotas de admin', () => {
  it('sem login dá 401', async () => {
    expect((await request(ctx.app).get('/api/admin/usuarios')).status).toBe(401);
  });

  it('cliente logado dá 403', async () => {
    const { agente } = await cadastrar(ctx.app);
    expect((await agente.get('/api/admin/usuarios')).status).toBe(403);
  });

  it('admin lista os usuários sem expor o hash da senha', async () => {
    const agente = await admin();
    await cadastrar(ctx.app);

    const res = await agente.get('/api/admin/usuarios');
    expect(res.status).toBe(200);
    expect(res.body.usuarios.map((u: { email: string }) => u.email)).toEqual(['admin@loja.com', 'ana@exemplo.com']);
    expect(JSON.stringify(res.body)).not.toContain('senha');
  });

  it('admin promove um cliente, e a permissão vale na hora', async () => {
    const agente = await admin();
    const cliente = await cadastrar(ctx.app);
    const id = cliente.res.body.usuario.id;

    expect((await cliente.agente.get('/api/admin/usuarios')).status).toBe(403);
    const res = await agente.patch(`/api/admin/usuarios/${id}/papel`).send({ papel: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.usuario.papel).toBe('admin');
    // mesma sessão de antes, sem precisar entrar de novo
    expect((await cliente.agente.get('/api/admin/usuarios')).status).toBe(200);
  });

  it('admin rebaixado perde o acesso na hora', async () => {
    const agente = await admin();
    const outro = await cadastrar(ctx.app, { email: 'outro@loja.com' });
    await tornarAdmin(ctx, 'outro@loja.com');

    await agente.patch(`/api/admin/usuarios/${outro.res.body.usuario.id}/papel`).send({ papel: 'cliente' });
    expect((await outro.agente.get('/api/admin/usuarios')).status).toBe(403);
  });

  it('admin não muda o próprio papel', async () => {
    const agente = await admin();
    const eu = await agente.get('/api/auth/eu');
    const res = await agente.patch(`/api/admin/usuarios/${eu.body.usuario.id}/papel`).send({ papel: 'cliente' });
    expect(res.status).toBe(400);
  });

  it('valida id e papel', async () => {
    const agente = await admin();
    expect((await agente.patch('/api/admin/usuarios/123/papel').send({ papel: 'admin' })).status).toBe(400);
    const { res } = await cadastrar(ctx.app);
    const id = res.body.usuario.id;
    expect((await agente.patch(`/api/admin/usuarios/${id}/papel`).send({ papel: 'dono' })).status).toBe(400);
    expect(
      (await agente.patch('/api/admin/usuarios/00000000-0000-4000-8000-000000000000/papel').send({ papel: 'admin' }))
        .status,
    ).toBe(404);
  });
});
