import { eq } from 'drizzle-orm';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DURACAO_SESSAO } from '../src/auth/sessoes.js';
import { sessoes, usuarios } from '../src/db/schema.js';
import { APP_URL, cadastrar, prepararBanco } from './ajuda.js';

const ctx = prepararBanco();

describe('cadastro', () => {
  it('cria a conta, já deixa logado e não devolve a senha', async () => {
    const { agente, res } = await cadastrar(ctx.app, { email: 'Ana@Exemplo.com ' });

    expect(res.status).toBe(201);
    expect(res.body.usuario).toMatchObject({ nome: 'Ana Souza', email: 'ana@exemplo.com', papel: 'cliente' });
    expect(JSON.stringify(res.body)).not.toContain('senha');

    const cookie = res.headers['set-cookie']![0]!;
    expect(cookie).toMatch(/sessao=/);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);

    const eu = await agente.get('/api/auth/eu');
    expect(eu.status).toBe(200);
    expect(eu.body.usuario.email).toBe('ana@exemplo.com');
  });

  it('guarda a senha com hash', async () => {
    await cadastrar(ctx.app);
    const [u] = await ctx.conexao.db.select().from(usuarios);
    expect(u!.senhaHash).not.toBe('senha-forte-123');
    expect(u!.senhaHash).toMatch(/^\$2[aby]\$/);
  });

  it('não deixa cadastrar o mesmo e-mail duas vezes, mesmo com maiúsculas', async () => {
    await cadastrar(ctx.app);
    const { res } = await cadastrar(ctx.app, { email: 'ANA@exemplo.com' });
    expect(res.status).toBe(409);
  });

  it('valida os campos', async () => {
    const { res } = await cadastrar(ctx.app, { nome: 'A', email: 'nao-e-email', senha: '123' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.campos).sort()).toEqual(['email', 'nome', 'senha']);
  });
});

describe('login', () => {
  it('entra com e-mail e senha certos', async () => {
    await cadastrar(ctx.app);
    const agente = request.agent(ctx.app);
    const res = await agente.post('/api/auth/login').send({ email: 'ana@exemplo.com', senha: 'senha-forte-123' });
    expect(res.status).toBe(200);
    expect((await agente.get('/api/auth/eu')).status).toBe(200);
  });

  it('dá a mesma resposta pra senha errada e pra e-mail que não existe', async () => {
    await cadastrar(ctx.app);
    const senhaErrada = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ana@exemplo.com', senha: 'errada' });
    const semConta = await request(ctx.app)
      .post('/api/auth/login')
      .send({ email: 'ninguem@exemplo.com', senha: 'errada' });

    expect(senhaErrada.status).toBe(401);
    expect(semConta.status).toBe(401);
    expect(senhaErrada.body).toEqual(semConta.body);
    expect(senhaErrada.headers['set-cookie']).toBeUndefined();
  });

  it('bloqueia depois de muitas tentativas', async () => {
    const { criarApp } = await import('../src/app.js');
    const app = criarApp({ db: ctx.conexao.db, appUrl: APP_URL, limiteTentativas: 3 });
    const tentar = () => request(app).post('/api/auth/login').send({ email: 'x@x.com', senha: 'errada' });

    for (let i = 0; i < 3; i++) expect((await tentar()).status).toBe(401);
    expect((await tentar()).status).toBe(429);
  });
});

describe('sessão', () => {
  it('sem cookie não acessa /eu', async () => {
    const res = await request(ctx.app).get('/api/auth/eu');
    expect(res.status).toBe(401);
  });

  it('cookie inventado não vale', async () => {
    const res = await request(ctx.app).get('/api/auth/eu').set('Cookie', 'sessao=token-inventado');
    expect(res.status).toBe(401);
  });

  it('salva só o hash do token no banco', async () => {
    const { res } = await cadastrar(ctx.app);
    const token = /sessao=([^;]+)/.exec(res.headers['set-cookie']![0]!)![1]!;
    const [s] = await ctx.conexao.db.select().from(sessoes);
    expect(s!.id).not.toBe(token);
    expect(s!.id).toHaveLength(64);
  });

  it('logout encerra a sessão no servidor, não só apaga o cookie', async () => {
    const { agente, res } = await cadastrar(ctx.app);
    const cookie = res.headers['set-cookie']![0]!.split(';')[0]!;

    expect((await agente.post('/api/auth/logout')).status).toBe(204);
    expect((await agente.get('/api/auth/eu')).status).toBe(401);
    // mesmo quem copiou o cookie antes do logout não consegue mais usar
    expect((await request(ctx.app).get('/api/auth/eu').set('Cookie', cookie)).status).toBe(401);
  });

  it('sessão vencida não vale e é apagada', async () => {
    const { agente } = await cadastrar(ctx.app);
    await ctx.conexao.db.update(sessoes).set({ expiraEm: new Date(Date.now() - 1000) });

    expect((await agente.get('/api/auth/eu')).status).toBe(401);
    expect(await ctx.conexao.db.select().from(sessoes)).toHaveLength(0);
  });

  it('renova a sessão de quem continua usando', async () => {
    const { agente } = await cadastrar(ctx.app);
    const quaseVencendo = new Date(Date.now() + DURACAO_SESSAO / 4);
    await ctx.conexao.db.update(sessoes).set({ expiraEm: quaseVencendo });

    const res = await agente.get('/api/auth/eu');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']![0]).toMatch(/sessao=/);
    const [s] = await ctx.conexao.db.select().from(sessoes);
    expect(s!.expiraEm.getTime()).toBeGreaterThan(Date.now() + DURACAO_SESSAO * 0.9);
  });

  it('apagar o usuário apaga as sessões dele', async () => {
    await cadastrar(ctx.app);
    await ctx.conexao.db.delete(usuarios).where(eq(usuarios.email, 'ana@exemplo.com'));
    expect(await ctx.conexao.db.select().from(sessoes)).toHaveLength(0);
  });
});

describe('proteções gerais', () => {
  it('recusa POST vindo de outro site', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', 'https://site-malicioso.com')
      .send({ email: 'ana@exemplo.com', senha: 'senha-forte-123' });
    expect(res.status).toBe(403);
  });

  it('aceita POST vindo do próprio front', async () => {
    const { res } = await cadastrar(ctx.app);
    expect(res.status).toBe(201);
    const login = await request(ctx.app)
      .post('/api/auth/login')
      .set('Origin', APP_URL)
      .send({ email: 'ana@exemplo.com', senha: 'senha-forte-123' });
    expect(login.status).toBe(200);
  });

  it('json quebrado vira 400 e não 500', async () => {
    const res = await request(ctx.app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
  });

  it('rota que não existe dá 404 em json', async () => {
    const res = await request(ctx.app).get('/api/nada');
    expect(res.status).toBe(404);
    expect(res.body.erro).toBeDefined();
  });
});
