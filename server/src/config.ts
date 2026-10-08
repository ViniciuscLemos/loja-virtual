import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  // sem DATABASE_URL o servidor usa o PGlite (Postgres rodando dentro do Node),
  // assim dá pra testar o projeto sem instalar nada
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().default('.pglite'),
  APP_URL: z.string().url().default('http://localhost:5173'),
});

const resultado = esquema.safeParse(process.env);
if (!resultado.success) {
  console.error('Variáveis de ambiente inválidas:', z.flattenError(resultado.error).fieldErrors);
  process.exit(1);
}

export const config = resultado.data;
export const producao = config.NODE_ENV === 'production';
