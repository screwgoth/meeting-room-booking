import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { LocationService } from './service.js';
import type { LocationRepo } from './repo.js';
import type { UserRepo } from '../auth/userRepo.js';
import { makeAuthPreHandler, requireRole } from '../auth/rbac.js';

const Name = z.string().trim().min(1, 'Name is required');
const Id = z.coerce.number().int().positive();

export interface LocationDeps {
  service: LocationService;
  repo: LocationRepo;
  users: UserRepo;
}

export async function registerLocationRoutes(
  app: FastifyInstance,
  deps: LocationDeps,
): Promise<void> {
  const requireAuth = makeAuthPreHandler(deps.users);
  const admin = [requireAuth, requireRole('ADMIN')];
  const authed = [requireAuth];
  const { service, repo } = deps;

  // ---- Reads (any authenticated user; feeds pickers/filters) --------------
  app.get('/api/offices', { preHandler: authed }, async (req) => {
    const includeInactive = (req.query as Record<string, unknown>)?.includeInactive === 'true';
    return { offices: await repo.listOffices(includeInactive) };
  });
  app.get('/api/offices/:officeId/floors', { preHandler: authed }, async (req) => {
    const officeId = Id.parse((req.params as Record<string, unknown>).officeId);
    const includeInactive = (req.query as Record<string, unknown>)?.includeInactive === 'true';
    return { floors: await repo.listFloors(officeId, includeInactive) };
  });
  app.get('/api/floors/:floorId/rooms', { preHandler: authed }, async (req) => {
    const floorId = Id.parse((req.params as Record<string, unknown>).floorId);
    const includeInactive = (req.query as Record<string, unknown>)?.includeInactive === 'true';
    return { rooms: await repo.listRoomsByFloor(floorId, includeInactive) };
  });
  app.get('/api/facilities', { preHandler: authed }, async () => {
    return { facilities: await repo.listFacilities(false) };
  });

  // ---- Offices (admin) -----------------------------------------------------
  app.post('/api/admin/offices', { preHandler: admin }, async (req, reply) => {
    const { name } = z.object({ name: Name }).parse(req.body);
    reply.code(201);
    return { office: await service.createOffice(name) };
  });
  app.patch('/api/admin/offices/:id', { preHandler: admin }, async (req) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    const body = z.object({ name: Name.optional(), isActive: z.boolean().optional() }).parse(req.body);
    return { office: await service.updateOffice(id, body) };
  });
  app.delete('/api/admin/offices/:id', { preHandler: admin }, async (req, reply) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    await service.deleteOffice(id);
    reply.code(204);
    return null;
  });

  // ---- Floors (admin) ------------------------------------------------------
  app.post('/api/admin/offices/:officeId/floors', { preHandler: admin }, async (req, reply) => {
    const officeId = Id.parse((req.params as Record<string, unknown>).officeId);
    const { name } = z.object({ name: Name }).parse(req.body);
    reply.code(201);
    return { floor: await service.createFloor(officeId, name) };
  });
  app.patch('/api/admin/floors/:id', { preHandler: admin }, async (req) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    const body = z.object({ name: Name.optional(), isActive: z.boolean().optional() }).parse(req.body);
    return { floor: await service.updateFloor(id, body) };
  });
  app.delete('/api/admin/floors/:id', { preHandler: admin }, async (req, reply) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    await service.deleteFloor(id);
    reply.code(204);
    return null;
  });

  // ---- Rooms (admin) -------------------------------------------------------
  const RoomCreate = z.object({
    floorId: Id,
    name: Name,
    capacity: z.number().int().positive('Capacity must be > 0'),
    facilityIds: z.array(Id).default([]),
  });
  app.post('/api/admin/rooms', { preHandler: admin }, async (req, reply) => {
    const b = RoomCreate.parse(req.body);
    reply.code(201);
    return { room: await service.createRoom(b.floorId, b.name, b.capacity, b.facilityIds) };
  });
  const RoomUpdate = z.object({
    floorId: Id.optional(),
    name: Name.optional(),
    capacity: z.number().int().positive('Capacity must be > 0').optional(),
    isActive: z.boolean().optional(),
    facilityIds: z.array(Id).optional(),
  });
  app.patch('/api/admin/rooms/:id', { preHandler: admin }, async (req) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    const body = RoomUpdate.parse(req.body);
    return { room: await service.updateRoom(id, body) };
  });
  app.get('/api/admin/rooms/:id', { preHandler: admin }, async (req) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    return { room: await service.roomWithFacilities(id) };
  });
  app.delete('/api/admin/rooms/:id', { preHandler: admin }, async (req, reply) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    await service.deleteRoom(id);
    reply.code(204);
    return null;
  });

  // ---- Facilities (admin) --------------------------------------------------
  app.get('/api/admin/facilities', { preHandler: admin }, async (req) => {
    const includeInactive = (req.query as Record<string, unknown>)?.includeInactive !== 'false';
    return { facilities: await repo.listFacilities(includeInactive) };
  });
  app.post('/api/admin/facilities', { preHandler: admin }, async (req, reply) => {
    const { name } = z.object({ name: Name }).parse(req.body);
    reply.code(201);
    return { facility: await service.createFacility(name) };
  });
  app.patch('/api/admin/facilities/:id', { preHandler: admin }, async (req) => {
    const id = Id.parse((req.params as Record<string, unknown>).id);
    const body = z.object({ name: Name.optional(), isActive: z.boolean().optional() }).parse(req.body);
    return { facility: await service.updateFacility(id, body) };
  });
}
