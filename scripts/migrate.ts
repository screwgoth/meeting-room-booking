import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from '../src/lib/loadEnv.js';
import { createDb } from '../src/lib/db.js';
import { runMigrations } from '../src/lib/migrate.js';

loadEnv();

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', 'migrations');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (copy .env.example to .env).');
  process.exit(1);
}

const db = createDb(url);
try {
  const applied = await runMigrations(db, migrationsDir);
  if (applied.length === 0) {
    console.log('Migrations: nothing to apply (up to date).');
  } else {
    console.log(`Migrations applied:\n  ${applied.join('\n  ')}`);
  }
} catch (err) {
  console.error('Migration failed:', err);
  process.exitCode = 1;
} finally {
  await db.close();
}
