import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { exigirPapel } from '../auth/middlewares.js';
import { publico } from '../auth/sessoes.js';
import type { Banco } from '../db/index.js';
import { papel, usuarios } from '../db/schema.js';
import { ErroHttp, naoEncontrado } from '../lib/erros.js';

const idSchema = z.uuid('Id inválido.');
const papelSchema = z.object({ papel: z.enum(papel.enumValues) });

export function rotasAdmin(db: Banco) {
  const r = Router();
  r.use(exigirPapel('admin'));

  r.get('/usuarios', async (_req, res) => {
    const lista = await db.select().from(usuarios).orderBy(asc(usuarios.criadoEm));
    res.json({ usuarios: lista.map((u) => ({ ...publico(u), criadoEm: u.criadoEm })) });
  });

  r.patch('/usuarios/:id/papel', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { papel } = papelSchema.parse(req.body);
    // senão a loja pode acabar sem nenhum admin
    if (id === req.usuario!.id) throw new ErroHttp(400, 'Você não pode mudar o seu próprio papel.');

    const [atualizado] = await db.update(usuarios).set({ papel }).where(eq(usuarios.id, id)).returning();
    if (!atualizado) throw naoEncontrado('Usuário');

    // não precisa derrubar as sessões: o papel é lido do banco a cada requisição
    res.json({ usuario: publico(atualizado) });
  });

  return r;
}
