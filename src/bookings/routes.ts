import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BookingService } from './service.js';
import type { UserRepo } from '../auth/userRepo.js';
import { makeAuthPreHandler } from '../auth/rbac.js';

const Id = z.coerce.number().int().positive();

const CreateBooking = z.object({
  room_id: Id,
  start: z.string().min(1),
  end: z.string().min(1),
  title: z.string().trim().min(1, 'Title is required'),
  attendee_count: z.number().int().positive().nullable().optional(),
});

// F11 edit: the form re-submits the full mutable set (room/time/title/attendees),
// re-validated against conflicts. Same shape as create.
const EditBooking = CreateBooking;

const CancelBody = z
  .object({ reason: z.string().trim().max(500).optional() })
  .optional();

export interface BookingDeps {
  service: BookingService;
  users: UserRepo;
}

export async function registerBookingRoutes(
  app: FastifyInstance,
  deps: BookingDeps,
): Promise<void> {
  const requireAuth = makeAuthPreHandler(deps.users);
  const authed = [requireAuth];
  const { service } = deps;

  // Create — the money path (#7). 201 on success; 409 on overlap; 422 on grid.
  app.post('/api/bookings', { preHandler: authed }, async (req, reply) => {
    const b = CreateBooking.parse(req.body);
    const result = await service.create(req.principal!.id, {
      roomId: b.room_id,
      startISO: b.start,
      endISO: b.end,
      title: b.title,
      attendeeCount: b.attendee_count ?? null,
    });
    reply.code(201);
    return result;
  });

  // Edit an own upcoming booking (F11) — re-validated against conflicts.
  // 200 on success; 403 non-owner; 404 missing; 409 overlap/cancelled/ended; 422 grid.
  app.patch('/api/bookings/:id', { preHandler: authed }, async (req) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    const b = EditBooking.parse(req.body);
    return service.update(req.principal!, id, {
      roomId: b.room_id,
      startISO: b.start,
      endISO: b.end,
      title: b.title,
      attendeeCount: b.attendee_count ?? null,
    });
  });

  // My bookings (#8) — upcoming + past for the authenticated user.
  app.get('/api/bookings/mine', { preHandler: authed }, async (req) => {
    return service.myBookings(req.principal!.id);
  });

  // Cancel (#8, F7) — status flip frees the slot. Owner or admin only.
  app.post('/api/bookings/:id/cancel', { preHandler: authed }, async (req) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    const body = CancelBody.parse(req.body);
    const booking = await service.cancel(req.principal!, id, body?.reason ?? null);
    return { booking };
  });
}
