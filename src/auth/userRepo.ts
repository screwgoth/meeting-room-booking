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
