import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { producao } from '../config.js';
import type { Banco } from '../db/index.js';
import type { Papel } from '../db/schema.js';
import { naoAutenticado, semPermissao } from '../lib/erros.js';
import { publico, validarSessao, type UsuarioPublico } from './sessoes.js';

declare global {
  namespace Express {
    interface Request {
      usuario?: UsuarioPublico;
      tokenSessao?: string;
    }
  }
}

export const COOKIE_SESSAO = 'sessao';

// httpOnly: o JavaScript da página não consegue ler o cookie (protege contra XSS)
// sameSite lax: o navegador não manda o cookie em POST vindo de outro site (CSRF)
export const opcoesCookie = (expiraEm: Date): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: producao,
  path: '/',
  expires: expiraEm,
});

export function carregarUsuario(db: Banco) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token: string | undefined = req.cookies?.[COOKIE_SESSAO];
    if (!token) return next();

    const sessao = await validarSessao(db, token);
    if (!sessao) {
      res.clearCookie(COOKIE_SESSAO, { path: '/' });
      return next();
    }

    req.usuario = publico(sessao.usuario);
    req.tokenSessao = token;
    if (sessao.renovada) res.cookie(COOKIE_SESSAO, token, opcoesCookie(sessao.expiraEm));
    next();
  };
}

export function exigirLogin(req: Request, _res: Response, next: NextFunction) {
  if (!req.usuario) throw naoAutenticado();
  next();
}

export function exigirPapel(...papeis: Papel[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.usuario) throw naoAutenticado();
    if (!papeis.includes(req.usuario.papel)) throw semPermissao();
    next();
  };
}
