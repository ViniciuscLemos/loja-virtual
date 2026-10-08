import type { ErrorRequestHandler } from 'express';
import { z } from 'zod';

export class ErroHttp extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const naoAutenticado = () => new ErroHttp(401, 'Você precisa entrar na sua conta.');
export const semPermissao = () => new ErroHttp(403, 'Você não tem permissão pra isso.');
export const naoEncontrado = (o = 'Recurso') => new ErroHttp(404, `${o} não encontrado.`);

export const tratarErros: ErrorRequestHandler = (erro, _req, res, _next) => {
  if (erro instanceof z.ZodError) {
    res.status(400).json({ erro: 'Dados inválidos.', campos: z.flattenError(erro).fieldErrors });
    return;
  }
  if (erro instanceof ErroHttp) {
    res.status(erro.status).json({ erro: erro.message });
    return;
  }
  // json mal formado no corpo da requisição
  if (erro?.type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'JSON inválido.' });
    return;
  }
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno. Tenta de novo daqui a pouco.' });
};
