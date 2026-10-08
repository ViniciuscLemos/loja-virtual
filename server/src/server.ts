import { criarApp } from './app.js';
import { config } from './config.js';
import { conectarPglite, conectarPostgres } from './db/index.js';

const conexao = config.DATABASE_URL
  ? conectarPostgres(config.DATABASE_URL)
  : conectarPglite(config.PGLITE_DIR);

await conexao.migrar();

const app = criarApp({ db: conexao.db, appUrl: config.APP_URL });
const servidor = app.listen(config.PORT, () => {
  const banco = config.DATABASE_URL ? 'PostgreSQL' : `PGlite (${config.PGLITE_DIR})`;
  console.log(`API rodando em http://localhost:${config.PORT} usando ${banco}`);
});

function desligar() {
  servidor.close(async () => {
    await conexao.fechar();
    process.exit(0);
  });
}
process.on('SIGINT', desligar);
process.on('SIGTERM', desligar);
