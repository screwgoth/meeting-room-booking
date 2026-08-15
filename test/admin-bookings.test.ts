import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, futureSlotISO, type TestApp } from './helpers/harness.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.close();
});

const inject = (
  cookie: string,
  method: 'GET' | 'POST' | 'PATCH',
  url: string,
  payload?: unknown,
) => t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

/** Alice books a fresh future window; returns the booking id. */
async function aliceBooks(dayOffset: number, startHour: number, endHour: number): Promise<number> {
  const cookie = await t.login('alice', 'alice1234');
  const res = await inject(cookie, 'POST', '/api/bookings', {
    room_id: t.fixture.boardroomId,
    start: futureSlotISO(dayOffset, startHour),
    end: futureSlotISO(dayOffset, endHour),
    title: 'Alice standup',
  });
  expect(res.statusCode).toBe(201);
  return res.json().booking.id;
}

describe('Admin booking management', () => {
  it('lists every upcoming booking with its owner (admin only)', async () => {
    await aliceBooks(2, 4, 5);
    const admin = await t.login('admin', 'admin1234');
    const res = await inject(admin, 'GET', '/api/admin/bookings');
    expect(res.statusCode).toBe(200);
    const { bookings } = res.json();
    expect(bookings.length).toBeGreaterThanOrEqual(1);
    const mine = bookings.find((b: { title: string }) => b.title === 'Alice standup');
    expect(mine.owner.username).toBe('alice');
  });

  it('forbids the admin list to non-admins (403)', async () => {
    const alice = await t.login('alice', 'alice1234');
    expect((await inject(alice, 'GET', '/api/admin/bookings')).statusCode).toBe(403);
  });

  it("lets an admin edit another user's booking", async () => {
    const id = await aliceBooks(3, 4, 5);
    const admin = await t.login('admin', 'admin1234');
    const res = await inject(admin, 'PATCH', `/api/bookings/${id}`, {
      room_id: t.fixture.boardroomId,
      start: futureSlotISO(3, 6),
      end: futureSlotISO(3, 7),
      title: 'Rescheduled by admin',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.title).toBe('Rescheduled by admin');
  });

  it("lets an admin reassign a booking's owner to another active user", async () => {
    const id = await aliceBooks(4, 4, 5);
    const admin = await t.login('admin', 'admin1234');
    const res = await inject(admin, 'PATCH', `/api/bookings/${id}`, {
      room_id: t.fixture.boardroomId,
      start: futureSlotISO(4, 4),
      end: futureSlotISO(4, 5),
      title: 'Alice standup',
      owner_user_id: t.fixture.bobId,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.owner.username).toBe('bob');
    // And it now shows up in bob's list, not alice's.
    const bob = await t.login('bob', 'bob1234');
    const bobMine = (await inject(bob, 'GET', '/api/bookings/mine')).json();
    expect(bobMine.upcoming.some((b: { id: number }) => b.id === id)).toBe(true);
  });

  it("forbids a non-admin from editing someone else's booking (403)", async () => {
    const id = await aliceBooks(5, 4, 5);
    const bob = await t.login('bob', 'bob1234');
    const res = await inject(bob, 'PATCH', `/api/bookings/${id}`, {
      room_id: t.fixture.boardroomId,
      start: futureSlotISO(5, 6),
      end: futureSlotISO(5, 7),
      title: 'Bob tries',
    });
    expect(res.statusCode).toBe(403);
  });

  it('forbids a non-admin from reassigning ownership of their own booking (403)', async () => {
    const cookie = await t.login('alice', 'alice1234');
    const created = await inject(cookie, 'POST', '/api/bookings', {
      room_id: t.fixture.huddleId,
      start: futureSlotISO(6, 4),
      end: futureSlotISO(6, 5),
      title: 'Alice own',
    });
    const id = created.json().booking.id;
    const res = await inject(cookie, 'PATCH', `/api/bookings/${id}`, {
      room_id: t.fixture.huddleId,
      start: futureSlotISO(6, 4),
      end: futureSlotISO(6, 5),
      title: 'Alice own',
      owner_user_id: t.fixture.bobId,
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects reassignment to a non-existent user (422)', async () => {
    const id = await aliceBooks(7, 4, 5);
    const admin = await t.login('admin', 'admin1234');
    const res = await inject(admin, 'PATCH', `/api/bookings/${id}`, {
      room_id: t.fixture.boardroomId,
      start: futureSlotISO(7, 4),
      end: futureSlotISO(7, 5),
      title: 'Alice standup',
      owner_user_id: 999999,
    });
    expect(res.statusCode).toBe(422);
  });

  it("lets an admin cancel another user's booking", async () => {
    const id = await aliceBooks(8, 4, 5);
    const admin = await t.login('admin', 'admin1234');
    const res = await inject(admin, 'POST', `/api/bookings/${id}/cancel`, {
      reason: 'Room needed for all-hands',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().booking.status).toBe('cancelled');
  });
});
