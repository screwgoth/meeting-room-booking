import type { Db } from '../lib/db.js';
import type { Role } from './types.js';

export interface UserRow {
  id: number;
  username: string;
  email: string | null;
  display_name: string;
  role: Role;
  password_hash: string | null;
  auth_source: 'LOCAL' | 'LDAP';
  directory_id: string | null;
  is_active: boolean;
}

export interface CreateLocalUserInput {
  username: string;
  displayName: string;
  passwordHash: string;
  email?: string | null;
  role?: Role;
}

/** Data access for app_user. All queries parameterized (§7). */
export class UserRepo {
  constructor(private readonly db: Db) {}

  async findByUsername(username: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT id, username, email, display_name, role, password_hash,
              auth_source, directory_id, is_active
         FROM app_user
        WHERE username = $1`,
      [username],
    );
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT id, username, email, display_name, role, password_hash,
              auth_source, directory_id, is_active
         FROM app_user
        WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /** Admin listing. Active users first, then by display name. */
  async list(includeInactive = true): Promise<UserRow[]> {
    const { rows } = await this.db.query<UserRow>(
      `SELECT id, username, email, display_name, role, password_hash,
              auth_source, directory_id, is_active
         FROM app_user
        WHERE ($1 OR is_active)
        ORDER BY is_active DESC, display_name`,
      [includeInactive],
    );
    return rows;
  }

  /** Patch profile fields (never the password — see setPassword). */
  async update(
    id: number,
    fields: { displayName?: string; email?: string | null; role?: Role; isActive?: boolean },
  ): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE app_user SET
         display_name = COALESCE($2, display_name),
         email        = CASE WHEN $3::boolean THEN $4 ELSE email END,
         role         = COALESCE($5, role),
         is_active    = COALESCE($6, is_active)
       WHERE id = $1
       RETURNING id, username, email, display_name, role, password_hash,
                 auth_source, directory_id, is_active`,
      [
        id,
        fields.displayName ?? null,
        fields.email !== undefined,
        fields.email ?? null,
        fields.role ?? null,
        fields.isActive ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  /** Reset a LOCAL user's password hash. */
  async setPassword(id: number, passwordHash: string): Promise<UserRow | null> {
    const { rows } = await this.db.query<UserRow>(
      `UPDATE app_user SET password_hash = $2
        WHERE id = $1 AND auth_source = 'LOCAL'
       RETURNING id, username, email, display_name, role, password_hash,
                 auth_source, directory_id, is_active`,
      [id, passwordHash],
    );
    return rows[0] ?? null;
  }

  async countActiveAdmins(): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM app_user
        WHERE role = 'ADMIN' AND is_active`,
    );
    return Number(rows[0]!.n);
  }

  async createLocal(input: CreateLocalUserInput): Promise<UserRow> {
    const { rows } = await this.db.query<UserRow>(
      `INSERT INTO app_user
         (username, email, display_name, role, password_hash, auth_source)
       VALUES ($1, $2, $3, $4, $5, 'LOCAL')
       RETURNING id, username, email, display_name, role, password_hash,
                 auth_source, directory_id, is_active`,
      [
        input.username,
        input.email ?? null,
        input.displayName,
        input.role ?? 'EMPLOYEE',
        input.passwordHash,
      ],
    );
    return rows[0]!;
  }
}
