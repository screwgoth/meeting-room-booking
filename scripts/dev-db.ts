import { loadEnv } from '../src/lib/loadEnv.js';
import { startEmbeddedPg } from '../src/lib/embeddedPg.js';

/**
 * Start a persistent rootless Postgres for local development and keep it
 * running until Ctrl-C. Point DATABASE_URL at it, then `npm run migrate`.
 */
loadEnv();

const port = Number(process.env.DEV_PG_PORT ?? 5433);
const dataDir = process.env.DEV_PG_DATA ?? '.pgdata';

const handle = await startEmbeddedPg({ port, dataDir, ephemeral: false });
console.log(`Dev Postgres up at ${handle.connectionString}`);
console.log('Press Ctrl-C to stop.');

const shutdown = async () => {
  console.log('\nStopping dev Postgres...');
  await handle.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
