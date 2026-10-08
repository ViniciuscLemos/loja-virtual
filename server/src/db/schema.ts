import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const papel = pgEnum('papel', ['cliente', 'admin']);

export const usuarios = pgTable('usuarios', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  // sempre salvo em minúsculas, pra "Ana@x.com" e "ana@x.com" serem a mesma conta
  email: text('email').notNull().unique(),
  senhaHash: text('senha_hash').notNull(),
  papel: papel('papel').notNull().default('cliente'),
  emailVerificadoEm: timestamp('email_verificado_em', { withTimezone: true }),
  criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
});

// O cookie guarda um token aleatório; aqui fica só o hash dele.
// Se o banco vazar, ninguém consegue usar as sessões.
export const sessoes = pgTable(
  'sessoes',
  {
    id: text('id').primaryKey(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    expiraEm: timestamp('expira_em', { withTimezone: true }).notNull(),
    criadoEm: timestamp('criado_em', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessoes_usuario_idx').on(t.usuarioId)],
);

export type Usuario = typeof usuarios.$inferSelect;
export type Papel = (typeof papel.enumValues)[number];
