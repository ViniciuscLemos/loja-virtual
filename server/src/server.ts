import { createApp } from './app.js';
import { config } from './config.js';
import { connectPglite, connectPostgres } from './db/index.js';
import { outboxMailer, smtpMailer } from './email/mailer.js';
import { demoProvider, stripeProvider } from './payments/provider.js';
import { seedProducts } from './products/sample.js';

const connection = config.DATABASE_URL ? connectPostgres(config.DATABASE_URL) : connectPglite(config.PGLITE_DIR);
await connection.migrate();
if (config.SEED_SAMPLE_PRODUCTS) await seedProducts(connection.db);

const mailer = config.SMTP_URL ? smtpMailer(config.SMTP_URL, config.MAIL_FROM) : outboxMailer({ log: true });
const payments = config.STRIPE_SECRET_KEY
  ? stripeProvider({ secretKey: config.STRIPE_SECRET_KEY, webhookSecret: config.STRIPE_WEBHOOK_SECRET! })
  : demoProvider(config.APP_URL);

const app = createApp({ db: connection.db, appUrl: config.APP_URL, mailer, payments });
const server = app.listen(config.PORT, () => {
  const database = config.DATABASE_URL ? 'PostgreSQL' : `PGlite (${config.PGLITE_DIR})`;
  console.log(`API running at http://localhost:${config.PORT} using ${database}`);
  if (mailer.kind === 'outbox') console.log('No SMTP_URL: emails go to the demo inbox (and to this log).');
  if (payments.kind === 'demo') console.log('No STRIPE_SECRET_KEY: payments use the demo checkout.');
});

// gives back the stock of orders that were never paid (every 5 minutes)
const sweeper = setInterval(() => {
  app.orders.expireStale().catch((e) => console.error('Failed to expire old orders:', e));
}, 5 * 60 * 1000);

function shutdown() {
  clearInterval(sweeper);
  server.close(async () => {
    await connection.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
