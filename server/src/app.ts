import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { rotasAdmin } from './admin/rotas.js';
import { carregarUsuario } from './auth/middlewares.js';
import { rotasAuth } from './auth/rotas.js';
import type { Banco } from './db/index.js';
import { ErroHttp, tratarErros } from './lib/erros.js';

export interface OpcoesApp {
  db: Banco;
  appUrl: string;
  limiteTentativas?: number;
}

// Segunda camada contra CSRF (a primeira é o sameSite do cookie):
// requisição que muda dados vinda de outro site é recusada.
function verificarOrigem(appUrl: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const origem = req.get('origin');
    if (req.method !== 'GET' && req.method !== 'HEAD' && origem && origem !== appUrl) {
      throw new ErroHttp(403, 'Origem não permitida.');
    }
    next();
  };
}

export function criarApp({ db, appUrl, limiteTentativas = 10 }: OpcoesApp) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use('/api', verificarOrigem(appUrl), carregarUsuario(db));

  app.get('/api/saude', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', rotasAuth(db, { limiteTentativas }));
  app.use('/api/admin', rotasAdmin(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ erro: 'Rota não encontrada.' });
  });
  app.use(tratarErros);
  return app;
}
