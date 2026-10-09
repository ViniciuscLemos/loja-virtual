import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const role = pgEnum('role', ['customer', 'admin']);
export const tokenType = pgEnum('token_type', ['verify_email', 'reset_password']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // always saved in lowercase, so "Ana@x.com" and "ana@x.com" are the same account
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: role('role').notNull().default('customer'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// The cookie holds a random token; only its hash is stored here.
// If the database leaks, nobody can use the sessions.
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// Single use tokens sent by email (account confirmation and password reset).
// Same idea as the sessions: the email has the token, the database only has the hash.
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: tokenType('type').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('auth_tokens_user_idx').on(t.userId)],
);

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // used in the url (/products/blue-mug), generated from the name
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull(),
    // money in cents, so there's no float rounding
    priceCents: integer('price_cents').notNull(),
    stock: integer('stock').notNull().default(0),
    imageUrl: text('image_url'),
    // archived products disappear from the store but stay in the old orders
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // the database itself refuses a negative stock, even if some code path forgets to check
    check('products_price_positive', sql`${t.priceCents} > 0`),
    check('products_stock_not_negative', sql`${t.stock} >= 0`),
    index('products_category_idx').on(t.category),
  ],
);

export type User = typeof users.$inferSelect;
export type Product = typeof products.$inferSelect;
export type TokenType = (typeof tokenType.enumValues)[number];
export type Role = (typeof role.enumValues)[number];
