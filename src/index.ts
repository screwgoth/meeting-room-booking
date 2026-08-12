import { loadEnv } from './lib/loadEnv.js';
import { loadConfig } from './config.js';
import { createDb } from './lib/db.js';
import { UserRepo } from './auth/userRepo.js';
import { LocalPasswordProvider } from './auth/localPasswordProvider.js';
import { buildServer } from './server.js';

loadEnv();

const config = loadConfig();
const db = createDb(config.databaseUrl);
const identityProvider = new LocalPasswordProvider(new UserRepo(db));

const app = await buildServer({ config, db, identityProvider });

const shutdown = async (signal: string) => {
  app.log.info?.(`${signal} received, shutting down`);
  await app.close();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`Meeting Room Booking API listening on http://${config.host}:${config.port}`);
} catch (err) {
  console.error('Failed to start server:', err);
  await db.close();
  process.exit(1);
}
