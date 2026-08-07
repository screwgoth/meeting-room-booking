import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AvailabilityService } from './service.js';
import type { UserRepo } from '../auth/userRepo.js';
import { makeAuthPreHandler } from '../auth/rbac.js';

const Id = z.coerce.number().int().positive();

// Facilities arrive as a comma-joined list (see frontend api client `qs`).
const FacilityList = z
  .string()
  .optional()
  .transform((s) =>
    s
      ? s
          .split(',')
          .map((x) => Number(x.trim()))
          .filter((n) => Number.isInteger(n) && n > 0)
      : undefined,
  );

const AvailabilityQuerySchema = z.object({
  office: Id,
  date: z.string(),
  floor: Id.optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  capacity: z.coerce.number().int().positive().optional(),
  facilities: FacilityList,
});

export interface AvailabilityDeps {
  service: AvailabilityService;
  users: UserRepo;
}

export async function registerAvailabilityRoutes(
  app: FastifyInstance,
  deps: AvailabilityDeps,
): Promise<void> {
  const requireAuth = makeAuthPreHandler(deps.users);

  app.get('/api/availability', { preHandler: [requireAuth] }, async (req) => {
    const q = AvailabilityQuerySchema.parse(req.query);
    return deps.service.query(
      {
        officeId: q.office,
        date: q.date,
        floorId: q.floor,
        start: q.start,
        end: q.end,
        capacity: q.capacity,
        facilityIds: q.facilities,
      },
      req.principal!.id,
    );
  });
}
