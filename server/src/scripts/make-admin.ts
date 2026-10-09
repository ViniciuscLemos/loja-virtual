// Usage: npm run make-admin -w server -- email@example.com
// The account has to exist already (create it through the normal sign up first).
// With PGlite, stop the API before running it: it only allows one process using the folder.
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { connectPglite, connectPostgres } from '../db/index.js';
import { users } from '../db/schema.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Missing the email. e.g. npm run make-admin -w server -- ana@example.com');
  process.exit(1);
}

const connection = config.DATABASE_URL ? connectPostgres(config.DATABASE_URL) : connectPglite(config.PGLITE_DIR);
await connection.migrate();

const [u] = await connection.db.update(users).set({ role: 'admin' }).where(eq(users.email, email)).returning();
console.log(u ? `${u.name} (${u.email}) is now an admin.` : `No account with the email ${email}.`);

await connection.close();
process.exit(u ? 0 : 1);
