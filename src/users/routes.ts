import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { UserService } from './service.js';
import type { UserRepo } from '../auth/userRepo.js';
import { makeAuthPreHandler, requireRole } from '../auth/rbac.js';

const Id = z.coerce.number().int().positive();
const Username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, 'Only letters, digits, dot, dash, underscore');
const DisplayName = z.string().trim().min(1, 'Display name is required').max(120);
const Email = z.string().trim().email('Invalid email').max(200);
const Password = z.string().min(8, 'Password must be at least 8 characters').max(200);
const RoleEnum = z.enum(['EMPLOYEE', 'ADMIN']);

export interface UserRoutesDeps {
  service: UserService;
  users: UserRepo;
}

/** Admin-only user administration (#1). All routes gated by ADMIN role (NF2). */
export async function registerUserRoutes(
  app: FastifyInstance,
  deps: UserRoutesDeps,
): Promise<void> {
  const requireAuth = makeAuthPreHandler(deps.users);
  const admin = [requireAuth, requireRole('ADMIN')];
  const { service } = deps;

  app.get('/api/admin/users', { preHandler: admin }, async () => {
    return { users: await service.list() };
  });

  const CreateBody = z.object({
    username: Username,
    displayName: DisplayName,
    email: Email.optional(),
    role: RoleEnum.default('EMPLOYEE'),
    password: Password,
  });
  app.post('/api/admin/users', { preHandler: admin }, async (req, reply) => {
    const b = CreateBody.parse(req.body);
    reply.code(201);
    return { user: await service.create(b) };
  });

  const UpdateBody = z.object({
    displayName: DisplayName.optional(),
    email: Email.nullable().optional(),
    role: RoleEnum.optional(),
    isActive: z.boolean().optional(),
    password: Password.optional(),
  });
  app.patch('/api/admin/users/:id', { preHandler: admin }, async (req) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    const b = UpdateBody.parse(req.body);
    return { user: await service.update(id, b) };
  });
}
