import { z } from 'zod';

// "Blue Ceramic Mug!" -> "blue-ceramic-mug"
export function slugify(text: string) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use only lowercase letters, numbers and dashes.');

// images can be a full url or a path served by the front end (/products/mug.svg)
const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/') || /^https?:\/\//.test(v), 'Use an http(s) url or a path starting with /.');

export const productInput = z.object({
  name: z.string().trim().min(2, 'Name is too short.').max(120),
  slug: slug.optional(),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().min(2).max(40),
  priceCents: z.number().int('Price must be in cents.').positive('Price must be greater than zero.').max(10_000_000),
  stock: z.number().int().min(0, "Stock can't be negative.").max(100_000).default(0),
  imageUrl: imageUrl.nullable().optional(),
  active: z.boolean().default(true),
});

// on update every field is optional, and nothing gets a default value
export const productUpdate = z
  .object({
    name: productInput.shape.name,
    slug,
    description: z.string().trim().max(2000),
    category: productInput.shape.category,
    priceCents: productInput.shape.priceCents,
    stock: z.number().int().min(0, "Stock can't be negative.").max(100_000),
    imageUrl: imageUrl.nullable(),
    active: z.boolean(),
  })
  .partial();

const page = z.coerce.number().int().min(1).default(1);

export const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.string().trim().max(40).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'name']).default('newest'),
  page,
  limit: z.coerce.number().int().min(1).max(60).default(12),
});

export const adminListQuery = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'active', 'archived', 'low_stock']).default('all'),
  page,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
