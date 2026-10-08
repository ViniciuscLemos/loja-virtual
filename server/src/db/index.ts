import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema.js';

// A API do drizzle é a mesma nos dois drivers, então o resto do código
// usa esse tipo e não precisa saber se é Postgres de verdade ou PGlite.
export type Banco = NodePgDatabase<typeof schema>;

export interface Conexao {
  db: Banco;
  migrar(): Promise<void>;
  fechar(): Promise<void>;
}

const pastaMigracoes = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export function conectarPostgres(url: string): Conexao {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzlePg(pool, { schema });
  return {
    db,
    migrar: () => migratePg(db, { migrationsFolder: pastaMigracoes }),
    fechar: () => pool.end(),
  };
}

// sem pasta = banco só na memória (usado nos testes)
export function conectarPglite(pasta?: string): Conexao {
  const cliente = new PGlite(pasta);
  const db = drizzlePglite(cliente, { schema });
  return {
    db: db as unknown as Banco,
    migrar: () => migratePglite(db, { migrationsFolder: pastaMigracoes }),
    fechar: () => cliente.close(),
  };
}
