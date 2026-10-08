import { eq } from 'drizzle-orm';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { Banco } from '../db/index.js';
import { usuarios } from '../db/schema.js';
import { ErroHttp } from '../lib/erros.js';
import { conferirSenha, gastarTempo, gerarHash } from '../lib/senha.js';
import { COOKIE_SESSAO, exigirLogin, opcoesCookie } from './middlewares.js';
import { criarSessao, encerrarSessao, publico } from './sessoes.js';

const email = z.string().trim().toLowerCase().pipe(z.email('E-mail inválido.'));

const cadastroSchema = z.object({
  nome: z.string().trim().min(2, 'Nome muito curto.').max(100),
  email,
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres.').max(72),
});

const loginSchema = z.object({
  email,
  senha: z.string().min(1).max(72),
});

export function rotasAuth(db: Banco, opcoes: { limiteTentativas: number }) {
  const r = Router();

  // Segura quem tenta adivinhar senha na força bruta
  const limite = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: opcoes.limiteTentativas,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { erro: 'Muitas tentativas. Espera uns minutos e tenta de novo.' },
  });

  r.post('/cadastro', limite, async (req, res) => {
    const dados = cadastroSchema.parse(req.body);

    const [criado] = await db
      .insert(usuarios)
      .values({ nome: dados.nome, email: dados.email, senhaHash: await gerarHash(dados.senha) })
      .onConflictDoNothing({ target: usuarios.email })
      .returning();
    if (!criado) throw new ErroHttp(409, 'Já existe uma conta com esse e-mail.');

    const sessao = await criarSessao(db, criado.id);
    res.cookie(COOKIE_SESSAO, sessao.token, opcoesCookie(sessao.expiraEm));
    res.status(201).json({ usuario: publico(criado) });
  });

  r.post('/login', limite, async (req, res) => {
    const dados = loginSchema.parse(req.body);

    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, dados.email));
    const senhaCerta = usuario
      ? await conferirSenha(dados.senha, usuario.senhaHash)
      : await gastarTempo(dados.senha);
    // mesma mensagem pros dois casos, pra não revelar se o e-mail tem conta
    if (!usuario || !senhaCerta) throw new ErroHttp(401, 'E-mail ou senha incorretos.');

    const sessao = await criarSessao(db, usuario.id);
    res.cookie(COOKIE_SESSAO, sessao.token, opcoesCookie(sessao.expiraEm));
    res.json({ usuario: publico(usuario) });
  });

  r.post('/logout', async (req, res) => {
    if (req.tokenSessao) await encerrarSessao(db, req.tokenSessao);
    res.clearCookie(COOKIE_SESSAO, { path: '/' });
    res.status(204).end();
  });

  r.get('/eu', exigirLogin, (req, res) => {
    res.json({ usuario: req.usuario });
  });

  return r;
}
