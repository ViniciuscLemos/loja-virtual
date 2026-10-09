import { and, asc, count, desc, eq, ilike, lte, or, type SQL } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/middlewares.js';
import type { Db } from '../db/index.js';
import { products, type Product } from '../db/schema.js';
import { HttpError, notFound } from '../lib/errors.js';
import { adminListQuery, listQuery, productInput, productUpdate, slugify } from './schemas.js';

export const LOW_STOCK = 5;

// what the store shows; the admin also sees active, createdAt and updatedAt
export function toPublicProduct(p: Product) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category,
    priceCents: p.priceCents,
    stock: p.stock,
    imageUrl: p.imageUrl,
  };
}

// % and _ are wildcards in ILIKE, so a search for "100%" would match anything with "100"
const likePattern = (text: string) => `%${text.replace(/[\\%_]/g, '\\$&')}%`;

function searchFilter(search?: string) {
  if (!search) return undefined;
  const pattern = likePattern(search);
  return or(ilike(products.name, pattern), ilike(products.description, pattern), ilike(products.category, pattern));
}

const SORTS = {
  newest: [desc(products.createdAt), asc(products.name)],
  price_asc: [asc(products.priceCents), asc(products.name)],
  price_desc: [desc(products.priceCents), asc(products.name)],
  name: [asc(products.name)],
} satisfies Record<string, SQL[]>;

async function page(db: Db, where: SQL | undefined, orderBy: SQL[], pageNumber: number, limit: number) {
  const [rows, counted] = await Promise.all([
    db
      .select()
      .from(products)
      .where(where)
      .orderBy(...orderBy)
      .limit(limit)
      .offset((pageNumber - 1) * limit),
    db.select({ total: count() }).from(products).where(where),
  ]);
  const total = counted[0]?.total ?? 0;
  return { rows, meta: { total, page: pageNumber, totalPages: Math.max(1, Math.ceil(total / limit)) } };
}

// a duplicated slug comes back from Postgres as a unique violation (23505)
function isUniqueViolation(error: unknown) {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === '23505' || e?.cause?.code === '23505';
}

export function productRoutes(db: Db) {
  const r = Router();

  r.get('/', async (req, res) => {
    const q = listQuery.parse(req.query);
    const where = and(
      eq(products.active, true),
      searchFilter(q.search),
      q.category ? eq(products.category, q.category) : undefined,
    );
    const { rows, meta } = await page(db, where, SORTS[q.sort], q.page, q.limit);
    res.json({ products: rows.map(toPublicProduct), ...meta });
  });

  r.get('/categories', async (_req, res) => {
    const rows = await db
      .selectDistinct({ category: products.category })
      .from(products)
      .where(eq(products.active, true))
      .orderBy(asc(products.category));
    res.json({ categories: rows.map((r) => r.category) });
  });

  r.get('/:slug', async (req, res) => {
    const slug = z.string().max(80).parse(req.params.slug);
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.slug, slug), eq(products.active, true)));
    if (!product) throw notFound('Product');
    res.json({ product: toPublicProduct(product) });
  });

  return r;
}

export function adminProductRoutes(db: Db) {
  const r = Router();
  r.use(requireRole('admin'));
  const idSchema = z.uuid('Invalid id.');

  r.get('/', async (req, res) => {
    const q = adminListQuery.parse(req.query);
    const status = {
      all: undefined,
      active: eq(products.active, true),
      archived: eq(products.active, false),
      low_stock: and(eq(products.active, true), lte(products.stock, LOW_STOCK)),
    }[q.status];
    const { rows, meta } = await page(db, and(status, searchFilter(q.search)), [asc(products.name)], q.page, q.limit);
    res.json({ products: rows, ...meta });
  });

  r.get('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const [product] = await db.select().from(products).where(eq(products.id, id));
    if (!product) throw notFound('Product');
    res.json({ product });
  });

  r.post('/', async (req, res) => {
    const data = productInput.parse(req.body);
    const slug = data.slug ?? slugify(data.name);
    if (!slug) throw new HttpError(400, "Couldn't make a url out of this name, send a slug.");
    try {
      const [created] = await db.insert(products).values({ ...data, slug }).returning();
      res.status(201).json({ product: created });
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, `There is already a product with the url "${slug}".`);
      throw e;
    }
  });

  r.patch('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const data = productUpdate.parse(req.body);
    if (Object.keys(data).length === 0) throw new HttpError(400, 'Nothing to update.');
    try {
      const [updated] = await db.update(products).set(data).where(eq(products.id, id)).returning();
      if (!updated) throw notFound('Product');
      res.json({ product: updated });
    } catch (e) {
      if (isUniqueViolation(e)) throw new HttpError(409, `There is already a product with the url "${data.slug}".`);
      throw e;
    }
  });

  // products are archived, not deleted: old orders still point to them
  r.delete('/:id', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const [archived] = await db.update(products).set({ active: false }).where(eq(products.id, id)).returning();
    if (!archived) throw notFound('Product');
    res.json({ product: archived });
  });

  return r;
}
