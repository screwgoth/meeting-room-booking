import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { startEmbeddedPg, type EmbeddedPgHandle } from '../../src/lib/embeddedPg.js';
import { createDb, type Db } from '../../src/lib/db.js';
import { runMigrations } from '../../src/lib/migrate.js';
import { hashPassword } from '../../src/auth/hash.js';
import { loadConfig, type Config } from '../../src/config.js';
import { UserRepo } from '../../src/auth/userRepo.js';
import { LocalPasswordProvider } from '../../src/auth/localPasswordProvider.js';
import { buildServer } from '../../src/server.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, '..', '..', 'migrations');

export interface Fixture {
  orgId: number;
  officeId: number;
  floorId: number;
  boardroomId: number; // capacity 12, has projector + whiteboard
  huddleId: number; // capacity 4, whiteboard only
  projectorId: number;
  whiteboardId: number;
  adminId: number;
  aliceId: number;
  bobId: number;
}

export interface TestApp {
  pg: EmbeddedPgHandle;
  db: Db;
  app: FastifyInstance;
  config: Config;
  fixture: Fixture;
  login: (username: string, password: string) => Promise<string>;
  close: () => Promise<void>;
}

const TEST_CONFIG = (databaseUrl: string): Config =>
  loadConfig({
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: 'test-session-secret-that-is-long-enough-32b',
    SESSION_SALT: 'mrb-test-salt-16',
    COOKIE_SECURE: 'false',
    ORG_DISPLAY_TZ: 'Asia/Kolkata',
  } as NodeJS.ProcessEnv);

async function seedFixture(db: Db): Promise<Fixture> {
  const org = await db.query<{ id: number }>(
    `INSERT INTO org (name, default_timezone) VALUES ('TestOrg', 'Asia/Kolkata') RETURNING id`,
  );
  const orgId = org.rows[0]!.id;

  const mkUser = async (
    username: string,
    role: 'ADMIN' | 'EMPLOYEE',
    password: string,
  ): Promise<number> => {
    const hash = await hashPassword(password);
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO app_user (username, display_name, role, password_hash, auth_source)
       VALUES ($1, $2, $3, $4, 'LOCAL') RETURNING id`,
      [username, `${username} name`, role, hash],
    );
    return rows[0]!.id;
  };
  const adminId = await mkUser('admin', 'ADMIN', 'admin1234');
  const aliceId = await mkUser('alice', 'EMPLOYEE', 'alice1234');
  const bobId = await mkUser('bob', 'EMPLOYEE', 'bob1234');

  const office = await db.query<{ id: number }>(
    `INSERT INTO office (org_id, name) VALUES ($1, 'HQ') RETURNING id`,
    [orgId],
  );
  const officeId = office.rows[0]!.id;
  const floor = await db.query<{ id: number }>(
    `INSERT INTO floor (office_id, name) VALUES ($1, 'Floor 1') RETURNING id`,
    [officeId],
  );
  const floorId = floor.rows[0]!.id;

  const projector = await db.query<{ id: number }>(
    `INSERT INTO facility (name) VALUES ('Projector') RETURNING id`,
  );
  const projectorId = projector.rows[0]!.id;
  const whiteboard = await db.query<{ id: number }>(
    `INSERT INTO facility (name) VALUES ('Whiteboard') RETURNING id`,
  );
  const whiteboardId = whiteboard.rows[0]!.id;

  const mkRoom = async (name: string, capacity: number, facilities: number[]): Promise<number> => {
    const { rows } = await db.query<{ id: number }>(
      `INSERT INTO room (floor_id, name, capacity) VALUES ($1, $2, $3) RETURNING id`,
      [floorId, name, capacity],
    );
    const roomId = rows[0]!.id;
    for (const fid of facilities) {
      await db.query('INSERT INTO room_facility (room_id, facility_id) VALUES ($1, $2)', [
        roomId,
        fid,
      ]);
    }
    return roomId;
  };
  const boardroomId = await mkRoom('Boardroom', 12, [projectorId, whiteboardId]);
  const huddleId = await mkRoom('Huddle', 4, [whiteboardId]);

  return {
    orgId,
    officeId,
    floorId,
    boardroomId,
    huddleId,
    projectorId,
    whiteboardId,
    adminId,
    aliceId,
    bobId,
  };
}

/** Boot an embedded Postgres, migrate, seed a fixture, and build the server. */
export async function startTestApp(): Promise<TestApp> {
  const port = 54000 + (process.pid % 4000);
  const dataDir = join(tmpdir(), `mrb-test-pg-${process.pid}`);
  const pg = await startEmbeddedPg({ port, dataDir, ephemeral: true });

  const db = createDb(pg.connectionString);
  await runMigrations(db, migrationsDir);
  const fixture = await seedFixture(db);

  const config = TEST_CONFIG(pg.connectionString);
  const identityProvider = new LocalPasswordProvider(new UserRepo(db));
  const app = await buildServer({ config, db, identityProvider });
  await app.ready();

  const login = async (username: string, password: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username, password },
    });
    if (res.statusCode !== 200) {
      throw new Error(`login failed for ${username}: ${res.statusCode} ${res.body}`);
    }
    const setCookie = res.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie[0] : setCookie;
    if (!raw) throw new Error('no session cookie returned');
    return raw.split(';')[0]!; // "session=<value>"
  };

  return {
    pg,
    db,
    app,
    config,
    fixture,
    login,
    close: async () => {
      await app.close();
      await db.close();
      await pg.stop();
    },
  };
}

/** ISO helper: today (UTC) at a given HH:MM UTC, grid-aligned. */
export function futureSlotISO(daysAhead: number, hh: number, mm = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  d.setUTCHours(hh, mm, 0, 0);
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
