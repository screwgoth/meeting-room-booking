import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startTestApp, type TestApp } from './helpers/harness.js';

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(async () => {
  await t?.close();
});

const inject = (cookie: string, method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });

describe('Admin user management (#1)', () => {
  it('rejects non-admins with 403', async () => {
    const cookie = await t.login('alice', 'alice1234');
    const res = await inject(cookie, 'GET', '/api/admin/users');
    expect(res.statusCode).toBe(403);
  });

  it('requires auth with 401', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  it('lists users for an admin (never leaks password_hash)', async () => {
    const cookie = await t.login('admin', 'admin1234');
    const res = await inject(cookie, 'GET', '/api/admin/users');
    expect(res.statusCode).toBe(200);
    const { users } = res.json();
    expect(users.length).toBeGreaterThanOrEqual(3);
    for (const u of users) {
      expect(u).not.toHaveProperty('password_hash');
      expect(u).toHaveProperty('username');
    }
  });

  it('creates a local user (201) who can then log in', async () => {
    const cookie = await t.login('admin', 'admin1234');
    const res = await inject(cookie, 'POST', '/api/admin/users', {
      username: 'carol',
      displayName: 'Carol Employee',
      email: 'carol@acme.com',
      role: 'EMPLOYEE',
      password: 'carol1234',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.username).toBe('carol');
    // The new credentials actually authenticate.
    await expect(t.login('carol', 'carol1234')).resolves.toContain('session=');
  });

  it('rejects a duplicate username with 409', async () => {
    const cookie = await t.login('admin', 'admin1234');
    const res = await inject(cookie, 'POST', '/api/admin/users', {
      username: 'alice',
      displayName: 'Another Alice',
      role: 'EMPLOYEE',
      password: 'nope12345',
    });
    expect(res.statusCode).toBe(409);
  });

  it('rejects a short password with 422', async () => {
    const cookie = await t.login('admin', 'admin1234');
    const res = await inject(cookie, 'POST', '/api/admin/users', {
      username: 'dave',
      displayName: 'Dave',
      role: 'EMPLOYEE',
      password: 'short',
    });
    expect(res.statusCode).toBe(422);
  });

  it('updates role + resets password, and the new password works', async () => {
    const cookie = await t.login('admin', 'admin1234');
    const res = await inject(cookie, 'PATCH', `/api/admin/users/${t.fixture.bobId}`, {
      role: 'ADMIN',
      password: 'bobNewPass1',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.role).toBe('ADMIN');
    await expect(t.login('bob', 'bobNewPass1')).resolves.toContain('session=');
  });

  it('deactivating a user blocks their login', async () => {
    const cookie = await t.login('admin', 'admin1234');
    // Create a throwaway user, then deactivate.
    await inject(cookie, 'POST', '/api/admin/users', {
      username: 'erin',
      displayName: 'Erin',
      role: 'EMPLOYEE',
      password: 'erin12345',
    });
    const list = (await inject(cookie, 'GET', '/api/admin/users')).json().users;
    const erin = list.find((u: { username: string }) => u.username === 'erin');
    const res = await inject(cookie, 'PATCH', `/api/admin/users/${erin.id}`, { isActive: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.is_active).toBe(false);
    await expect(t.login('erin', 'erin12345')).rejects.toThrow();
  });

  it('refuses to demote the last active admin', async () => {
    const cookie = await t.login('admin', 'admin1234');
    // bob was promoted to ADMIN above, so there are 2 admins — demote bob first.
    await inject(cookie, 'PATCH', `/api/admin/users/${t.fixture.bobId}`, { role: 'EMPLOYEE' });
    // Now 'admin' is the last active admin; demoting must 409.
    const res = await inject(cookie, 'PATCH', `/api/admin/users/${t.fixture.adminId}`, {
      role: 'EMPLOYEE',
    });
    expect(res.statusCode).toBe(409);
  });
});
