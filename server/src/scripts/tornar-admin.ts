// Uso: npm run tornar-admin -w server -- email@exemplo.com
// A conta precisa já existir (cria pelo cadastro normal antes).
// Com o PGlite, para a API antes de rodar: ele só aceita um processo usando a pasta.
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { conectarPglite, conectarPostgres } from '../db/index.js';
import { usuarios } from '../db/schema.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Faltou o e-mail. Ex: npm run tornar-admin -w server -- ana@exemplo.com');
  process.exit(1);
}

const conexao = config.DATABASE_URL ? conectarPostgres(config.DATABASE_URL) : conectarPglite(config.PGLITE_DIR);
await conexao.migrar();

const [u] = await conexao.db.update(usuarios).set({ papel: 'admin' }).where(eq(usuarios.email, email)).returning();
console.log(u ? `${u.nome} (${u.email}) agora é admin.` : `Nenhuma conta com o e-mail ${email}.`);

await conexao.fechar();
process.exit(u ? 0 : 1);
