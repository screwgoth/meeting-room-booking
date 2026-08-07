import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './db.js';

/**
 * Minimal forward-only migration runner. Applies ordered *.sql files from the
 * migrations/ directory, each inside its own transaction, and records applied
 * filenames in schema_migrations. Idempotent: already-applied files are skipped.
 *
 * Deliberately small and transparent so the raw §2 EXCLUDE-constraint SQL stays
 * first-class (no ORM translation layer). Versioned + reviewable per AGENTS.md.
 */
export async function runMigrations(
  db: Db,
  migrationsDir: string,
): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (
      await db.query<{ filename: string }>('SELECT filename FROM schema_migrations')
    ).rows.map((r) => r.filename),
  );

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const newlyApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await db.tx(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [
        file,
      ]);
    });
    newlyApplied.push(file);
  }
  return newlyApplied;
}
