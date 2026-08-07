import EmbeddedPostgres from 'embedded-postgres';
import { rmSync } from 'node:fs';

/**
 * Rootless Postgres for local dev and tests. The deployment target is a real
 * managed Postgres (§6); this only exists because the build host has no docker/
 * root. It runs actual PG binaries in userspace, so the §2 EXCLUDE constraint
 * behaves identically to production.
 */
export interface EmbeddedPgHandle {
  connectionString: string;
  stop: () => Promise<void>;
}

export interface EmbeddedPgOptions {
  port: number;
  dataDir: string;
  /** Wipe the data dir first and don't persist — used by ephemeral test runs. */
  ephemeral?: boolean;
  user?: string;
  password?: string;
  database?: string;
}

export async function startEmbeddedPg(
  opts: EmbeddedPgOptions,
): Promise<EmbeddedPgHandle> {
  const user = opts.user ?? 'mrb';
  const password = opts.password ?? 'mrb';
  const database = opts.database ?? 'mrb';

  if (opts.ephemeral) {
    rmSync(opts.dataDir, { recursive: true, force: true });
  }

  const pg = new EmbeddedPostgres({
    databaseDir: opts.dataDir,
    user,
    password,
    port: opts.port,
    persistent: !opts.ephemeral,
  });

  await pg.initialise();
  await pg.start();
  // The default 'postgres' database always exists; create ours if needed.
  try {
    await pg.createDatabase(database);
  } catch {
    // already exists — fine
  }

  const connectionString = `postgres://${user}:${password}@127.0.0.1:${opts.port}/${database}`;
  return {
    connectionString,
    stop: async () => {
      await pg.stop();
    },
  };
}
