import type { Db } from '../db/index.js';
import { products } from '../db/schema.js';
import { slugify } from './schemas.js';

// A small catalog so the store doesn't open empty. The images live in web/public/products.
const SAMPLE = [
  ['Classic Coffee Mug', 'Mugs', 1490, 40, 'mug', '350 ml ceramic mug that keeps the coffee warm through a long debugging session. Dishwasher safe.'],
  ['Night Owl Mug', 'Mugs', 1690, 25, 'mug-night', 'Dark blue mug for the ones who code after midnight. 350 ml, ceramic.'],
  ['Hello World T-shirt', 'Apparel', 2990, 30, 'tshirt', 'Soft 100% cotton t-shirt with the first program everyone writes. Regular fit.'],
  ['Merge Conflict Hoodie', 'Apparel', 5490, 12, 'hoodie', 'Warm hoodie with a front pocket big enough for a phone and a rubber duck.'],
  ['Dev Cap', 'Apparel', 1990, 3, 'cap', 'Adjustable cotton cap. Keeps the sun out of your eyes and the screen glare away.'],
  ['Dotted Notebook', 'Desk', 1290, 60, 'notebook', 'A5 notebook with 120 dotted pages, great for sketching diagrams and to-do lists.'],
  ['Desk Plant', 'Desk', 2190, 8, 'plant', 'Small succulent in a ceramic pot. Hard to kill, even if you forget it for a week.'],
  ['Warm Desk Lamp', 'Desk', 3990, 15, 'lamp', 'LED lamp with warm light and three brightness levels. USB-C powered.'],
  ['Sticker Pack', 'Desk', 790, 100, 'stickers', 'Ten vinyl stickers to cover the back of your laptop. Water resistant.'],
  ['Mechanical Keyboard', 'Tech', 8990, 6, 'keyboard', 'Compact 75% keyboard with tactile switches and a satisfying click.'],
  ['Wireless Headphones', 'Tech', 7490, 10, 'headphones', 'Over-ear headphones with noise cancelling and 30 hours of battery.'],
  ['Large Mouse Pad', 'Tech', 1890, 0, 'mousepad', 'Extra large mouse pad that fits the keyboard and the mouse. Stitched edges.'],
] as const;

export async function seedProducts(db: Db) {
  const rows = SAMPLE.map(([name, category, priceCents, stock, image, description]) => ({
    name,
    slug: slugify(name),
    category,
    priceCents,
    stock,
    description,
    imageUrl: `/products/${image}.svg`,
  }));
  // running it twice doesn't duplicate anything
  const inserted = await db.insert(products).values(rows).onConflictDoNothing({ target: products.slug }).returning();
  return inserted.length;
}
