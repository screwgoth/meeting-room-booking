import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Principal, Role } from './types.js';
import type { UserRepo } from './userRepo.js';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
  }
}

/**
 * Resolve the session's user into request.principal, fresh from the DB so a
 * deactivated user or a role change takes effect immediately (§7). Stores only
 * userId in the (encrypted) session cookie — never the whole principal.
 */
export function makeAuthPreHandler(users: UserRepo) {
  return async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.session.get('userId') as number | undefined;
    if (!userId) throw new UnauthorizedError();

    const user = await users.findById(userId);
    if (!user || !user.is_active) {
      request.session.delete();
      reply.clearCookie?.('session');
      throw new UnauthorizedError();
    }

    request.principal = {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
    };
  };
}

/**
 * Role gate for admin routes/actions (NF2). Server-side, never UI-gated. Must
 * run AFTER the auth preHandler. Denies with 403.
 */
export function requireRole(role: Role) {
  return async function roleGuard(request: FastifyRequest): Promise<void> {
    if (!request.principal) throw new UnauthorizedError();
    if (request.principal.role !== role) throw new ForbiddenError();
  };
}
