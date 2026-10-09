import { createApp } from './app.js';
import { config } from './config.js';
import { connectPglite, connectPostgres } from './db/index.js';
import { outboxMailer, smtpMailer } from './email/mailer.js';

const connection = config.DATABASE_URL ? connectPostgres(config.DATABASE_URL) : connectPglite(config.PGLITE_DIR);

await connection.migrate();

const mailer = config.SMTP_URL ? smtpMailer(config.SMTP_URL, config.MAIL_FROM) : outboxMailer({ log: true });

const app = createApp({ db: connection.db, appUrl: config.APP_URL, mailer });
const server = app.listen(config.PORT, () => {
  const database = config.DATABASE_URL ? 'PostgreSQL' : `PGlite (${config.PGLITE_DIR})`;
  console.log(`API running at http://localhost:${config.PORT} using ${database}`);
  if (mailer.kind === 'outbox') console.log('No SMTP_URL: emails go to the demo inbox (and to this log).');
});

function shutdown() {
  server.close(async () => {
    await connection.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
