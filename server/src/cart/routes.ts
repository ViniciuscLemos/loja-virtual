import { and, asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requireLogin } from '../auth/middlewares.js';
import type { Db } from '../db/index.js';
import { cartItems, products } from '../db/schema.js';
import { HttpError, notFound } from '../lib/errors.js';
import { toPublicProduct } from '../products/routes.js';

export async function getCart(db: Db, userId: string) {
  const rows = await db
    .select({ product: products, quantity: cartItems.quantity })
    .from(cartItems)
    .innerJoin(products, eq(cartItems.productId, products.id))
    .where(eq(cartItems.userId, userId))
    .orderBy(asc(cartItems.addedAt), asc(products.name));

  const items = rows.map(({ product, quantity }) => ({
    product: toPublicProduct(product),
    quantity,
    // the front end shows a warning on these, and the checkout refuses the order
    available: product.active && product.stock >= quantity,
  }));
  const subtotalCents = items.reduce((sum, i) => sum + i.product.priceCents * i.quantity, 0);
  return { items, subtotalCents, count: items.reduce((sum, i) => sum + i.quantity, 0) };
}

const quantitySchema = z.object({ quantity: z.number().int().min(0).max(99) });

export function cartRoutes(db: Db) {
  const r = Router();
  r.use(requireLogin);

  r.get('/', async (req, res) => {
    res.json(await getCart(db, req.user!.id));
  });

  // sets the quantity of a product in the cart; 0 takes it out
  r.put('/items/:productId', async (req, res) => {
    const productId = z.uuid('Invalid id.').parse(req.params.productId);
    const { quantity } = quantitySchema.parse(req.body);
    const userId = req.user!.id;

    if (quantity === 0) {
      await db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productId, productId)));
      return res.json(await getCart(db, userId));
    }

    const [product] = await db.select().from(products).where(eq(products.id, productId));
    if (!product || !product.active) throw notFound('Product');
    if (quantity > product.stock) {
      throw new HttpError(409, product.stock ? `Only ${product.stock} left of ${product.name}.` : `${product.name} is out of stock.`);
    }

    await db
      .insert(cartItems)
      .values({ userId, productId, quantity })
      .onConflictDoUpdate({ target: [cartItems.userId, cartItems.productId], set: { quantity } });
    res.json(await getCart(db, userId));
  });

  r.delete('/', async (req, res) => {
    await db.delete(cartItems).where(eq(cartItems.userId, req.user!.id));
    res.json(await getCart(db, req.user!.id));
  });

  return r;
}
