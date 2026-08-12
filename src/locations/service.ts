import type { LocationRepo, OfficeRow, FloorRow, RoomRow, FacilityRow } from './repo.js';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors.js';

/**
 * Location management rules (#3/#4). Enforces:
 *  - soft-delete via is_active (deactivate) — bookings/history preserved (NF5)
 *  - block hard-delete of a non-empty office/floor/room (§3)
 *  - referential validity of chosen floor/facilities
 * Blank-name / capacity validation lives at the DB (CHECK) and the route (zod);
 * here we translate DB/lookup failures into typed AppErrors.
 */
export class LocationService {
  constructor(private readonly repo: LocationRepo) {}

  // ---- Offices -------------------------------------------------------------
  async createOffice(name: string): Promise<OfficeRow> {
    const orgId = await this.repo.getDefaultOrgId();
    return this.repo.createOffice(orgId, name);
  }
  async updateOffice(id: number, fields: { name?: string; isActive?: boolean }): Promise<OfficeRow> {
    const row = await this.repo.updateOffice(id, fields);
    if (!row) throw new NotFoundError('Office not found');
    return row;
  }
  async deleteOffice(id: number): Promise<void> {
    const office = await this.repo.getOffice(id);
    if (!office) throw new NotFoundError('Office not found');
    if ((await this.repo.countFloors(id)) > 0) {
      throw new ConflictError(
        'Office has floors and cannot be hard-deleted. Deactivate it instead.',
      );
    }
    await this.repo.deleteOffice(id);
  }

  // ---- Floors --------------------------------------------------------------
  async createFloor(officeId: number, name: string): Promise<FloorRow> {
    const office = await this.repo.getOffice(officeId);
    if (!office) throw new NotFoundError('Office not found');
    return this.repo.createFloor(officeId, name);
  }
  async updateFloor(id: number, fields: { name?: string; isActive?: boolean }): Promise<FloorRow> {
    const row = await this.repo.updateFloor(id, fields);
    if (!row) throw new NotFoundError('Floor not found');
    return row;
  }
  async deleteFloor(id: number): Promise<void> {
    const floor = await this.repo.getFloor(id);
    if (!floor) throw new NotFoundError('Floor not found');
    if ((await this.repo.countRooms(id)) > 0) {
      throw new ConflictError(
        'Floor has rooms and cannot be hard-deleted. Deactivate it instead.',
      );
    }
    await this.repo.deleteFloor(id);
  }

  // ---- Rooms ---------------------------------------------------------------
  async createRoom(
    floorId: number,
    name: string,
    capacity: number,
    facilityIds: number[],
  ): Promise<RoomRow> {
    const floor = await this.repo.getFloor(floorId);
    if (!floor) throw new NotFoundError('Floor not found');
    if (!(await this.repo.facilitiesExist(facilityIds))) {
      throw new ValidationError('One or more facilities do not exist or are inactive');
    }
    return this.repo.createRoom(floorId, name, capacity, facilityIds);
  }
  async updateRoom(
    id: number,
    fields: {
      name?: string;
      capacity?: number;
      floorId?: number;
      isActive?: boolean;
      facilityIds?: number[];
    },
  ): Promise<RoomRow> {
    if (fields.floorId !== undefined) {
      const floor = await this.repo.getFloor(fields.floorId);
      if (!floor) throw new NotFoundError('Target floor not found');
    }
    if (fields.facilityIds && !(await this.repo.facilitiesExist(fields.facilityIds))) {
      throw new ValidationError('One or more facilities do not exist or are inactive');
    }
    const row = await this.repo.updateRoom(id, fields);
    if (!row) throw new NotFoundError('Room not found');
    return row;
  }
  async deleteRoom(id: number): Promise<void> {
    const room = await this.repo.getRoom(id);
    if (!room) throw new NotFoundError('Room not found');
    if ((await this.repo.countBookings(id)) > 0) {
      throw new ConflictError(
        'Room has bookings and cannot be hard-deleted. Deactivate it instead.',
      );
    }
    await this.repo.deleteRoom(id);
  }
  async roomWithFacilities(id: number): Promise<RoomRow & { facilityIds: number[] }> {
    const room = await this.repo.getRoom(id);
    if (!room) throw new NotFoundError('Room not found');
    const facilityIds = await this.repo.getRoomFacilityIds(id);
    return { ...room, facilityIds };
  }

  // ---- Facilities ----------------------------------------------------------
  async createFacility(name: string): Promise<FacilityRow> {
    return this.repo.createFacility(name);
  }
  async updateFacility(id: number, fields: { name?: string; isActive?: boolean }): Promise<FacilityRow> {
    const row = await this.repo.updateFacility(id, fields);
    if (!row) throw new NotFoundError('Facility not found');
    return row;
  }
}
