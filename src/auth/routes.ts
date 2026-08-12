import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { IdentityProvider } from './types.js';
import type { UserRepo } from './userRepo.js';
import { makeAuthPreHandler } from './rbac.js';

const LoginBody = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export interface AuthDeps {
  identityProvider: IdentityProvider;
  users: UserRepo;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  deps: AuthDeps,
): Promise<void> {
  const requireAuth = makeAuthPreHandler(deps.users);

  app.post('/api/auth/login', async (request, reply) => {
    const body = LoginBody.parse(request.body);
    const principal = await deps.identityProvider.authenticate(body);
    // Rotate/establish session; store only the user id (§7).
    request.session.set('userId', principal.id);
    reply.code(200);
    return { user: principal };
  });

  app.post(
    '/api/auth/logout',
    { preHandler: requireAuth },
    async (request, reply) => {
      request.session.delete();
      reply.code(204);
      return null;
    },
  );

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request) => {
    return { user: request.principal };
  });
}
