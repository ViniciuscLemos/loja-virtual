// Usage: npm run seed -w server
// Adds the sample products. With PGlite, stop the API before running it.
import { config } from '../config.js';
import { connectPglite, connectPostgres } from '../db/index.js';
import { seedProducts } from '../products/sample.js';

const connection = config.DATABASE_URL ? connectPostgres(config.DATABASE_URL) : connectPglite(config.PGLITE_DIR);
await connection.migrate();

const added = await seedProducts(connection.db);
console.log(added ? `${added} sample products added.` : 'The sample products were already there.');

await connection.close();
