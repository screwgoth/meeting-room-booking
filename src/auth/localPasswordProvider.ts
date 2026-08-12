import type { Credentials, IdentityProvider, Principal } from './types.js';
import type { UserRepo } from './userRepo.js';
import { verifyPassword } from './hash.js';
import { UnauthorizedError } from '../lib/errors.js';

/**
 * v1 identity adapter — local username/password (§4, D2).
 *
 * Failure modes (unknown user, inactive user, non-LOCAL account, bad password)
 * all return the SAME generic error to avoid username enumeration. We still run
 * a hash verify against a dummy when the user is missing to keep timing flat.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000';

export class LocalPasswordProvider implements IdentityProvider {
  constructor(private readonly users: UserRepo) {}

  async authenticate(credentials: Credentials): Promise<Principal> {
    const user = await this.users.findByUsername(credentials.username);

    if (!user || !user.is_active || user.auth_source !== 'LOCAL' || !user.password_hash) {
      // Equalize timing against the found-user path, then reject uniformly.
      await verifyPassword(DUMMY_HASH, credentials.password);
      throw new UnauthorizedError('Invalid username or password');
    }

    const ok = await verifyPassword(user.password_hash, credentials.password);
    if (!ok) {
      throw new UnauthorizedError('Invalid username or password');
    }

    return {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    };
  }
}
