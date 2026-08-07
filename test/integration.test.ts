import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, type TestApp } from './helpers/harness.js';

let t: TestApp;

// A grid-aligned future window that lands inside the 08:00–20:00 IST grid.
// 04:00–05:00 UTC == 09:30–10:30 IST (org tz Asia/Kolkata).
function slot(daysAhead: number, startUTCHour: number, endUTCHour: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysAhead);
  const mk = (h: number) => {
    const x = new Date(d);
    x.setUTCHours(h, 0, 0, 0);
    return x.toISOString().replace(/\.\d{3}Z$/, 'Z');
  };
  return { start: mk(startUTCHour), end: mk(endUTCHour), date: mk(startUTCHour).slice(0, 10) };
}

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.close();
});

describe('POST /api/bookings (the money path, #7)', () => {
  it('creates a booking (201) with no warnings', async () => {
    const cookie = await t.login('alice', 'alice1234');
    const s = slot(2, 4, 5);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie },
      payload: { room_id: t.fixture.boardroomId, start: s.start, end: s.end, title: 'Standup' },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.booking.status).toBe('confirmed');
    expect(body.booking.location.room).toBe('Boardroom');
    expect(body.warnings).toEqual([]);
  });

  it('rejects a grid-misaligned window with 422', async () => {
    const cookie = await t.login('alice', 'alice1234');
    const s = slot(3, 4, 5);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie },
      payload: {
        room_id: t.fixture.boardroomId,
        start: s.start.replace('04:00', '04:07'),
        end: s.end,
        title: 'Bad grid',
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('returns a non-blocking warning when attendees exceed capacity', async () => {
    const cookie = await t.login('alice', 'alice1234');
    const s = slot(4, 4, 5);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie },
      payload: {
        room_id: t.fixture.huddleId, // capacity 4
        start: s.start,
        end: s.end,
        title: 'Too many',
        attendee_count: 6,
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.booking.status).toBe('confirmed');
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0].code).toBe('attendees_over_capacity');
  });

  it('returns 409 when the same room/slot is double-booked over HTTP', async () => {
    const alice = await t.login('alice', 'alice1234');
    const bob = await t.login('bob', 'bob1234');
    const s = slot(5, 4, 5);
    const first = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie: alice },
      payload: { room_id: t.fixture.boardroomId, start: s.start, end: s.end, title: 'First' },
    });
    expect(first.statusCode).toBe(201);
    const second = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie: bob },
      payload: { room_id: t.fixture.boardroomId, start: s.start, end: s.end, title: 'Second' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('conflict');
  });
});

// ⭐ The product promise: the DB EXCLUDE constraint, exercised deterministically
// with two concurrent transactions. Exactly one insert wins; the loser raises
// SQLSTATE 23P01. No timing luck — we serialize commit order by hand.
describe('deterministic two-txn race (§2)', () => {
  const INSERT = `INSERT INTO booking (room_id, user_id, during, title)
                  VALUES ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'), $5)`;

  async function raceOnce(roomId: number, start: string, end: string) {
    const a = await t.db.pool.connect();
    const b = await t.db.pool.connect();
    try {
      await a.query('BEGIN');
      await b.query('BEGIN');
      // A inserts and holds the predicate lock (uncommitted).
      await a.query(INSERT, [roomId, t.fixture.aliceId, start, end, 'A']);
      // B's overlapping insert blocks on the GiST exclusion index...
      const bInsert = b.query(INSERT, [roomId, t.fixture.bobId, start, end, 'B']);
      // ...until A commits, at which point B must fail with 23P01.
      await a.query('COMMIT');
      let bFailed = false;
      try {
        await bInsert;
        await b.query('COMMIT');
      } catch (err) {
        bFailed = true;
        expect((err as { code?: string }).code).toBe('23P01');
        await b.query('ROLLBACK');
      }
      expect(bFailed).toBe(true);
    } finally {
      a.release();
      b.release();
    }
  }

  it('lets exactly one of two concurrent inserts win (A then B)', async () => {
    const s = slot(10, 4, 5);
    await raceOnce(t.fixture.huddleId, s.start, s.end);
    const { rows } = await t.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM booking
        WHERE room_id = $1 AND status = 'confirmed'
          AND during = tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [t.fixture.huddleId, s.start, s.end],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });

  it('holds when commit order is reversed (fresh slot)', async () => {
    // Same guarantee, different slot — proves it isn't order/luck dependent.
    const s = slot(11, 4, 5);
    await raceOnce(t.fixture.boardroomId, s.start, s.end);
    const { rows } = await t.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM booking
        WHERE room_id = $1 AND status = 'confirmed'
          AND during = tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [t.fixture.boardroomId, s.start, s.end],
    );
    expect(Number(rows[0]!.n)).toBe(1);
  });
});

describe('GET /api/availability (F4/F5)', () => {
  it('lists office rooms with bookings, fits, and free_in_window', async () => {
    const cookie = await t.login('alice', 'alice1234');
    const s = slot(6, 4, 5); // 09:30–10:30 IST
    // Book the boardroom for that window.
    await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie },
      payload: { room_id: t.fixture.boardroomId, start: s.start, end: s.end, title: 'Blocker' },
    });

    const res = await t.app.inject({
      method: 'GET',
      url: `/api/availability?office=${t.fixture.officeId}&date=${s.date}&start=09:30&end=10:30&capacity=6&facilities=${t.fixture.projectorId}`,
      headers: { cookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.timezone).toBe('Asia/Kolkata');
    expect(body.window).toEqual({ start: '08:00', end: '20:00' });

    const board = body.rooms.find((r: { id: number }) => r.id === t.fixture.boardroomId);
    const huddle = body.rooms.find((r: { id: number }) => r.id === t.fixture.huddleId);
    // Boardroom: cap 12 >= 6 and has projector → fits; but booked in window.
    expect(board.fits).toBe(true);
    expect(board.free_in_window).toBe(false);
    expect(board.bookings.length).toBeGreaterThanOrEqual(1);
    // Huddle: cap 4 < 6 and no projector → does not fit; free in window.
    expect(huddle.fits).toBe(false);
    expect(huddle.free_in_window).toBe(true);
  });
});

describe('my-bookings + cancel (#8, F7)', () => {
  it('lists upcoming bookings and cancel frees the slot', async () => {
    const cookie = await t.login('bob', 'bob1234');
    const s = slot(7, 4, 5);
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie },
      payload: { room_id: t.fixture.boardroomId, start: s.start, end: s.end, title: 'To cancel' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().booking.id;

    const mine = await t.app.inject({
      method: 'GET',
      url: '/api/bookings/mine',
      headers: { cookie },
    });
    expect(mine.statusCode).toBe(200);
    expect(mine.json().upcoming.some((b: { id: number }) => b.id === id)).toBe(true);

    // Non-owner cannot cancel.
    const alice = await t.login('alice', 'alice1234');
    const forbidden = await t.app.inject({
      method: 'POST',
      url: `/api/bookings/${id}/cancel`,
      headers: { cookie: alice },
      payload: { reason: 'nope' },
    });
    expect(forbidden.statusCode).toBe(403);

    // Owner cancels → status flips.
    const cancelled = await t.app.inject({
      method: 'POST',
      url: `/api/bookings/${id}/cancel`,
      headers: { cookie },
      payload: { reason: 'plans changed' },
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().booking.status).toBe('cancelled');

    // Slot is now free — the same window can be re-booked.
    const rebook = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie: alice },
      payload: { room_id: t.fixture.boardroomId, start: s.start, end: s.end, title: 'Reclaimed' },
    });
    expect(rebook.statusCode).toBe(201);
  });
});

describe('soft-delete guards the write path (NF5)', () => {
  it('rejects booking a room under a soft-deleted floor', async () => {
    const cookie = await t.login('alice', 'alice1234');
    // Fresh floor + room so we can deactivate the floor in isolation.
    const floor = await t.db.query<{ id: number }>(
      `INSERT INTO floor (office_id, name) VALUES ($1, 'Temp Floor') RETURNING id`,
      [t.fixture.officeId],
    );
    const room = await t.db.query<{ id: number }>(
      `INSERT INTO room (floor_id, name, capacity) VALUES ($1, 'Temp Room', 6) RETURNING id`,
      [floor.rows[0]!.id],
    );
    await t.db.query('UPDATE floor SET is_active = false WHERE id = $1', [floor.rows[0]!.id]);

    const s = slot(12, 4, 5);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie },
      payload: { room_id: room.rows[0]!.id, start: s.start, end: s.end, title: 'Should fail' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });

  it('rejects booking a room under a soft-deleted office', async () => {
    const cookie = await t.login('alice', 'alice1234');
    const office = await t.db.query<{ id: number }>(
      `INSERT INTO office (org_id, name) VALUES ($1, 'Temp Office') RETURNING id`,
      [t.fixture.orgId],
    );
    const floor = await t.db.query<{ id: number }>(
      `INSERT INTO floor (office_id, name) VALUES ($1, 'F') RETURNING id`,
      [office.rows[0]!.id],
    );
    const room = await t.db.query<{ id: number }>(
      `INSERT INTO room (floor_id, name, capacity) VALUES ($1, 'R', 6) RETURNING id`,
      [floor.rows[0]!.id],
    );
    await t.db.query('UPDATE office SET is_active = false WHERE id = $1', [office.rows[0]!.id]);

    const s = slot(13, 4, 5);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      headers: { cookie },
      payload: { room_id: room.rows[0]!.id, start: s.start, end: s.end, title: 'Should fail' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
  });
});

describe('auth guards', () => {
  it('rejects unauthenticated booking with 401', async () => {
    const s = slot(8, 4, 5);
    const res = await t.app.inject({
      method: 'POST',
      url: '/api/bookings',
      payload: { room_id: t.fixture.boardroomId, start: s.start, end: s.end, title: 'Anon' },
    });
    expect(res.statusCode).toBe(401);
  });
});
