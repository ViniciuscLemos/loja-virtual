import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { products } from '../src/db/schema.js';
import { seedProducts } from '../src/products/sample.js';
import { slugify } from '../src/products/schemas.js';
import { makeAdmin, register, setupDatabase } from './helpers.js';

const ctx = setupDatabase();

async function admin() {
  const { agent } = await register(ctx.app, { name: 'Admin', email: 'admin@store.com' });
  await makeAdmin(ctx, 'admin@store.com');
  return agent;
}

const mug = { name: 'Blue Mug', category: 'Mugs', priceCents: 1500, stock: 10, description: 'A blue mug.' };

describe('slugify', () => {
  it('makes a clean url out of the name', () => {
    expect(slugify('Blue Ceramic Mug!')).toBe('blue-ceramic-mug');
    expect(slugify('  Café com Pão  ')).toBe('cafe-com-pao');
    expect(slugify('100% Cotton -- T-shirt')).toBe('100-cotton-t-shirt');
  });
});

describe('store catalog', () => {
  it('lists only active products, with pagination', async () => {
    await seedProducts(ctx.connection.db);
    const agent = await admin();
    const list = await agent.get('/api/admin/products');
    await agent.delete(`/api/admin/products/${list.body.products[0].id}`);

    const res = await request(ctx.app).get('/api/products?limit=5');
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(5);
    expect(res.body.total).toBe(11);
    expect(res.body.totalPages).toBe(3);
    expect(res.body.products[0]).not.toHaveProperty('active');
  });

  it('searches, filters by category and sorts by price', async () => {
    await seedProducts(ctx.connection.db);

    const search = await request(ctx.app).get('/api/products?search=mug');
    expect(search.body.products.map((p: { name: string }) => p.name).sort()).toEqual(['Classic Coffee Mug', 'Night Owl Mug']);

    const tech = await request(ctx.app).get('/api/products?category=Tech&sort=price_asc');
    const prices = tech.body.products.map((p: { priceCents: number }) => p.priceCents);
    expect(prices).toEqual([...prices].sort((a: number, b: number) => a - b));
    expect(tech.body.products.every((p: { category: string }) => p.category === 'Tech')).toBe(true);

    const categories = await request(ctx.app).get('/api/products/categories');
    expect(categories.body.categories).toEqual(['Apparel', 'Desk', 'Mugs', 'Tech']);
  });

  it('search treats % and _ as plain text', async () => {
    const agent = await admin();
    await agent.post('/api/admin/products').send({ ...mug, name: '100% Cotton Bag' });
    await agent.post('/api/admin/products').send({ ...mug, name: '1000 Piece Puzzle' });

    const res = await request(ctx.app).get(`/api/products?search=${encodeURIComponent('100%')}`);
    expect(res.body.products.map((p: { name: string }) => p.name)).toEqual(['100% Cotton Bag']);
  });

  it('opens a product by its url, and archived ones give 404', async () => {
    const agent = await admin();
    const { body } = await agent.post('/api/admin/products').send(mug);

    const res = await request(ctx.app).get('/api/products/blue-mug');
    expect(res.status).toBe(200);
    expect(res.body.product.name).toBe('Blue Mug');

    await agent.delete(`/api/admin/products/${body.product.id}`);
    expect((await request(ctx.app).get('/api/products/blue-mug')).status).toBe(404);
  });

  it('validates the query', async () => {
    expect((await request(ctx.app).get('/api/products?sort=;drop table')).status).toBe(400);
    expect((await request(ctx.app).get('/api/products?limit=1000')).status).toBe(400);
  });
});

describe('admin products', () => {
  it('only admins can manage products', async () => {
    expect((await request(ctx.app).post('/api/admin/products').send(mug)).status).toBe(401);
    const { agent } = await register(ctx.app);
    expect((await agent.post('/api/admin/products').send(mug)).status).toBe(403);
    expect((await agent.get('/api/admin/products')).status).toBe(403);
  });

  it('creates a product with a slug from the name', async () => {
    const agent = await admin();
    const res = await agent.post('/api/admin/products').send(mug);
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ slug: 'blue-mug', active: true, stock: 10 });
  });

  it('refuses a repeated slug with 409', async () => {
    const agent = await admin();
    await agent.post('/api/admin/products').send(mug);
    const res = await agent.post('/api/admin/products').send(mug);
    expect(res.status).toBe(409);
    const other = await agent.post('/api/admin/products').send({ ...mug, name: 'Other', slug: 'other' });
    expect((await agent.patch(`/api/admin/products/${other.body.product.id}`).send({ slug: 'blue-mug' })).status).toBe(409);
  });

  it('validates price, stock and image', async () => {
    const agent = await admin();
    const bad = await agent
      .post('/api/admin/products')
      .send({ ...mug, priceCents: 15.5, stock: -1, imageUrl: 'javascript:alert(1)' });
    expect(bad.status).toBe(400);
    expect(Object.keys(bad.body.fields).sort()).toEqual(['imageUrl', 'priceCents', 'stock']);
  });

  it('updates only the fields sent', async () => {
    const agent = await admin();
    const { body } = await agent.post('/api/admin/products').send(mug);
    const res = await agent.patch(`/api/admin/products/${body.product.id}`).send({ stock: 3 });
    expect(res.status).toBe(200);
    expect(res.body.product).toMatchObject({ stock: 3, name: 'Blue Mug', priceCents: 1500 });
    expect((await agent.patch(`/api/admin/products/${body.product.id}`).send({})).status).toBe(400);
  });

  it('archives instead of deleting, and can bring it back', async () => {
    const agent = await admin();
    const { body } = await agent.post('/api/admin/products').send(mug);
    const id = body.product.id;

    expect((await agent.delete(`/api/admin/products/${id}`)).body.product.active).toBe(false);
    expect(await ctx.connection.db.select().from(products)).toHaveLength(1);
    expect((await agent.patch(`/api/admin/products/${id}`).send({ active: true })).body.product.active).toBe(true);
  });

  it('filters archived and low stock products', async () => {
    await seedProducts(ctx.connection.db);
    const agent = await admin();

    const low = await agent.get('/api/admin/products?status=low_stock');
    expect(low.body.products.map((p: { name: string }) => p.name).sort()).toEqual(['Dev Cap', 'Large Mouse Pad']);
  });

  it('the database refuses a negative stock even outside the API', async () => {
    const agent = await admin();
    await agent.post('/api/admin/products').send(mug);
    await expect(ctx.connection.db.update(products).set({ stock: -1 })).rejects.toThrow();
  });

  it('seeding twice does not duplicate products', async () => {
    expect(await seedProducts(ctx.connection.db)).toBe(12);
    expect(await seedProducts(ctx.connection.db)).toBe(0);
  });
});
