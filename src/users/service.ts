import type { UserRepo, UserRow } from '../auth/userRepo.js';
import type { Role } from '../auth/types.js';
import { hashPassword } from '../auth/hash.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

/** Public user shape — never leaks password_hash / directory internals (§7). */
export interface PublicUser {
  id: number;
  username: string;
  email: string | null;
  display_name: string;
  role: Role;
  auth_source: 'LOCAL' | 'LDAP';
  is_active: boolean;
}

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    display_name: row.display_name,
    role: row.role,
    auth_source: row.auth_source,
    is_active: row.is_active,
  };
}

export interface CreateUserInput {
  username: string;
  displayName: string;
  password: string;
  email?: string | null;
  role: Role;
}

export interface UpdateUserInput {
  displayName?: string;
  email?: string | null;
  role?: Role;
  isActive?: boolean;
  password?: string;
}

/**
 * User administration (#1). Enforces:
 *  - unique usernames (translated from the DB unique violation)
 *  - LOCAL-only password management (directory users are v2, no local hash)
 *  - the "last active admin" guard so an org can never lock itself out (NF2)
 * Soft-delete via is_active — never hard-delete a user (bookings reference them).
 */
export class UserService {
  constructor(private readonly repo: UserRepo) {}

  async list(): Promise<PublicUser[]> {
    return (await this.repo.list(true)).map(toPublic);
  }

  async create(input: CreateUserInput): Promise<PublicUser> {
    const existing = await this.repo.findByUsername(input.username);
    if (existing) throw new ConflictError('A user with that username already exists');
    const passwordHash = await hashPassword(input.password);
    try {
      const row = await this.repo.createLocal({
        username: input.username,
        displayName: input.displayName,
        passwordHash,
        email: input.email ?? null,
        role: input.role,
      });
      return toPublic(row);
    } catch (err) {
      // Unique-violation race between the check and the insert.
      if (isUniqueViolation(err)) {
        throw new ConflictError('A user with that username already exists');
      }
      throw err;
    }
  }

  async update(id: number, fields: UpdateUserInput): Promise<PublicUser> {
    const current = await this.repo.findById(id);
    if (!current) throw new NotFoundError('User not found');

    // Guard the last active admin from being demoted or deactivated.
    const losingAdmin =
      current.role === 'ADMIN' &&
      current.is_active &&
      ((fields.role !== undefined && fields.role !== 'ADMIN') || fields.isActive === false);
    if (losingAdmin && (await this.repo.countActiveAdmins()) <= 1) {
      throw new ConflictError('Cannot remove the last active administrator');
    }

    if (fields.password !== undefined) {
      if (current.auth_source !== 'LOCAL') {
        throw new ValidationError('Only local users have a managed password');
      }
      await this.repo.setPassword(id, await hashPassword(fields.password));
    }

    const row = await this.repo.update(id, {
      displayName: fields.displayName,
      email: fields.email,
      role: fields.role,
      isActive: fields.isActive,
    });
    if (!row) throw new NotFoundError('User not found');
    return toPublic(row);
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}
