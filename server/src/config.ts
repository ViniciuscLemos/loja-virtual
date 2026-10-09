import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  // without DATABASE_URL the server uses PGlite (Postgres running inside Node),
  // so you can try the project without installing anything
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('.pglite'),
  APP_URL: z.string().url().default('http://localhost:5173'),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment variables:', z.flattenError(result.error).fieldErrors);
  process.exit(1);
}

export const config = result.data;
export const isProduction = config.NODE_ENV === 'production';
