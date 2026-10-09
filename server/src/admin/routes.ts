import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth/middlewares.js';
import { toPublic } from '../auth/sessions.js';
import type { Db } from '../db/index.js';
import { role, users } from '../db/schema.js';
import { HttpError, notFound } from '../lib/errors.js';

const idSchema = z.uuid('Invalid id.');
const roleSchema = z.object({ role: z.enum(role.enumValues) });

export function adminRoutes(db: Db) {
  const r = Router();
  r.use(requireRole('admin'));

  r.get('/users', async (_req, res) => {
    const list = await db.select().from(users).orderBy(asc(users.createdAt));
    res.json({ users: list.map((u) => ({ ...toPublic(u), createdAt: u.createdAt })) });
  });

  r.patch('/users/:id/role', async (req, res) => {
    const id = idSchema.parse(req.params.id);
    const { role } = roleSchema.parse(req.body);
    // otherwise the store could end up with no admin at all
    if (id === req.user!.id) throw new HttpError(400, "You can't change your own role.");

    const [updated] = await db.update(users).set({ role }).where(eq(users.id, id)).returning();
    if (!updated) throw notFound('User');

    // no need to kill the sessions: the role is read from the database on every request
    res.json({ user: toPublic(updated) });
  });

  return r;
}
