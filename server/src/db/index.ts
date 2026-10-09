import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePg, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import pg from 'pg';
import * as schema from './schema.js';

// The drizzle API is the same for both drivers, so the rest of the code
// uses this type and doesn't need to know if it's real Postgres or PGlite.
export type Db = NodePgDatabase<typeof schema>;

export interface Connection {
  db: Db;
  migrate(): Promise<void>;
  close(): Promise<void>;
}

const migrationsFolder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');

export function connectPostgres(url: string): Connection {
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzlePg(pool, { schema });
  return {
    db,
    migrate: () => migratePg(db, { migrationsFolder }),
    close: () => pool.end(),
  };
}

// no folder = in-memory database (used in the tests)
export function connectPglite(folder?: string): Connection {
  const client = new PGlite(folder);
  const db = drizzlePglite(client, { schema });
  return {
    db: db as unknown as Db,
    migrate: () => migratePglite(db, { migrationsFolder }),
    close: () => client.close(),
  };
}
