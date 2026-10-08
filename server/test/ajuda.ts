import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { criarApp } from '../src/app.js';
import { conectarPglite, type Conexao } from '../src/db/index.js';
import { usuarios } from '../src/db/schema.js';

export const APP_URL = 'http://localhost:5173';

// Cada arquivo de teste ganha um Postgres em memória (PGlite) com as migrações
// aplicadas, e as tabelas são limpas antes de cada teste.
export function prepararBanco() {
  const ctx = {} as { conexao: Conexao; app: ReturnType<typeof criarApp> };

  beforeAll(async () => {
    ctx.conexao = conectarPglite();
    await ctx.conexao.migrar();
    ctx.app = criarApp({ db: ctx.conexao.db, appUrl: APP_URL, limiteTentativas: 1000 });
  });

  beforeEach(async () => {
    await ctx.conexao.db.execute(sql`truncate table usuarios cascade`);
  });

  afterAll(async () => {
    await ctx.conexao.fechar();
  });

  return ctx;
}

// supertest.agent guarda os cookies entre as requisições, como um navegador
export async function cadastrar(
  app: ReturnType<typeof criarApp>,
  dados: Partial<{ nome: string; email: string; senha: string }> = {},
) {
  const agente = request.agent(app);
  const corpo = { nome: 'Ana Souza', email: 'ana@exemplo.com', senha: 'senha-forte-123', ...dados };
  const res = await agente.post('/api/auth/cadastro').send(corpo);
  return { agente, res, ...corpo };
}

export async function tornarAdmin(ctx: { conexao: Conexao }, email: string) {
  await ctx.conexao.db.update(usuarios).set({ papel: 'admin' }).where(eq(usuarios.email, email));
}
