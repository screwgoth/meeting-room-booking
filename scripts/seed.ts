import { loadEnv } from '../src/lib/loadEnv.js';
import { createDb } from '../src/lib/db.js';
import { hashPassword } from '../src/auth/hash.js';

/**
 * Idempotent development seed: one org, an admin + an employee, a couple of
 * offices/floors/rooms and a facility set. Passwords come from env (SEED_*),
 * defaulting to well-known dev creds — never use these in production.
 */
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (copy .env.example to .env).');
  process.exit(1);
}

const adminPass = process.env.SEED_ADMIN_PASSWORD ?? 'admin1234';
const userPass = process.env.SEED_USER_PASSWORD ?? 'user1234';

const db = createDb(url);

async function ensureOrg(): Promise<number> {
  const existing = await db.query<{ id: number }>('SELECT id FROM org ORDER BY id LIMIT 1');
  if (existing.rows[0]) return existing.rows[0].id;
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO org (name, default_timezone) VALUES ($1, $2) RETURNING id`,
    ['Acme Corp', process.env.ORG_DISPLAY_TZ ?? 'Asia/Kolkata'],
  );
  return rows[0]!.id;
}

async function ensureUser(
  username: string,
  displayName: string,
  role: 'ADMIN' | 'EMPLOYEE',
  password: string,
): Promise<void> {
  const existing = await db.query('SELECT id FROM app_user WHERE username = $1', [username]);
  if (existing.rows[0]) return;
  const hash = await hashPassword(password);
  await db.query(
    `INSERT INTO app_user (username, display_name, role, password_hash, auth_source)
     VALUES ($1, $2, $3, $4, 'LOCAL')`,
    [username, displayName, role, hash],
  );
}

async function ensureFacility(name: string): Promise<number> {
  const { rows } = await db.query<{ id: number }>(
    `INSERT INTO facility (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [name],
  );
  return rows[0]!.id;
}

try {
  const orgId = await ensureOrg();

  await ensureUser('admin', 'Admin User', 'ADMIN', adminPass);
  await ensureUser('alice', 'Alice Employee', 'EMPLOYEE', userPass);

  const projector = await ensureFacility('Projector');
  const whiteboard = await ensureFacility('Whiteboard');
  const videoConf = await ensureFacility('Video Conferencing');

  // Only seed locations if none exist yet, to stay idempotent.
  const officeCount = await db.query<{ n: string }>(
    'SELECT count(*)::text AS n FROM office WHERE org_id = $1',
    [orgId],
  );
  if (Number(officeCount.rows[0]!.n) === 0) {
    const office = await db.query<{ id: number }>(
      `INSERT INTO office (org_id, name) VALUES ($1, $2) RETURNING id`,
      [orgId, 'Mumbai HQ'],
    );
    const officeId = office.rows[0]!.id;
    const floor = await db.query<{ id: number }>(
      `INSERT INTO floor (office_id, name) VALUES ($1, $2) RETURNING id`,
      [officeId, 'Floor 1'],
    );
    const floorId = floor.rows[0]!.id;

    const rooms: [string, number, number[]][] = [
      ['Boardroom', 12, [projector, whiteboard, videoConf]],
      ['Huddle A', 4, [whiteboard]],
      ['Focus Pod', 2, []],
    ];
    for (const [name, capacity, facilities] of rooms) {
      const room = await db.query<{ id: number }>(
        `INSERT INTO room (floor_id, name, capacity) VALUES ($1, $2, $3) RETURNING id`,
        [floorId, name, capacity],
      );
      const roomId = room.rows[0]!.id;
      for (const fid of facilities) {
        await db.query(
          'INSERT INTO room_facility (room_id, facility_id) VALUES ($1, $2)',
          [roomId, fid],
        );
      }
    }
  }

  console.log('Seed complete. Users: admin / alice (see SEED_* env for passwords).');
} catch (err) {
  console.error('Seed failed:', err);
  process.exitCode = 1;
} finally {
  await db.close();
}
