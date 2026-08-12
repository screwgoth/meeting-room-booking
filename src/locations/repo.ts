import type { Db } from '../lib/db.js';

export interface OfficeRow {
  id: number;
  org_id: number;
  name: string;
  timezone: string | null;
  is_active: boolean;
}
export interface FloorRow {
  id: number;
  office_id: number;
  name: string;
  is_active: boolean;
}
export interface RoomRow {
  id: number;
  floor_id: number;
  name: string;
  capacity: number;
  is_active: boolean;
}
export interface FacilityRow {
  id: number;
  name: string;
  is_active: boolean;
}

/** Data access for the location hierarchy + facilities. All parameterized. */
export class LocationRepo {
  constructor(private readonly db: Db) {}

  // ---- Org -----------------------------------------------------------------
  async getDefaultOrgId(): Promise<number> {
    const { rows } = await this.db.query<{ id: number }>(
      'SELECT id FROM org ORDER BY id LIMIT 1',
    );
    if (!rows[0]) throw new Error('No org row exists; run seed.');
    return rows[0].id;
  }

  // ---- Offices -------------------------------------------------------------
  async createOffice(orgId: number, name: string): Promise<OfficeRow> {
    const { rows } = await this.db.query<OfficeRow>(
      `INSERT INTO office (org_id, name) VALUES ($1, $2)
       RETURNING id, org_id, name, timezone, is_active`,
      [orgId, name],
    );
    return rows[0]!;
  }
  async listOffices(includeInactive = false): Promise<OfficeRow[]> {
    const { rows } = await this.db.query<OfficeRow>(
      `SELECT id, org_id, name, timezone, is_active FROM office
        WHERE ($1 OR is_active) ORDER BY name`,
      [includeInactive],
    );
    return rows;
  }
  async getOffice(id: number): Promise<OfficeRow | null> {
    const { rows } = await this.db.query<OfficeRow>(
      `SELECT id, org_id, name, timezone, is_active FROM office WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }
  async updateOffice(
    id: number,
    fields: { name?: string; isActive?: boolean },
  ): Promise<OfficeRow | null> {
    const { rows } = await this.db.query<OfficeRow>(
      `UPDATE office SET
         name = COALESCE($2, name),
         is_active = COALESCE($3, is_active)
       WHERE id = $1
       RETURNING id, org_id, name, timezone, is_active`,
      [id, fields.name ?? null, fields.isActive ?? null],
    );
    return rows[0] ?? null;
  }
  async countFloors(officeId: number): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM floor WHERE office_id = $1',
      [officeId],
    );
    return Number(rows[0]!.n);
  }
  async deleteOffice(id: number): Promise<void> {
    await this.db.query('DELETE FROM office WHERE id = $1', [id]);
  }

  // ---- Floors --------------------------------------------------------------
  async createFloor(officeId: number, name: string): Promise<FloorRow> {
    const { rows } = await this.db.query<FloorRow>(
      `INSERT INTO floor (office_id, name) VALUES ($1, $2)
       RETURNING id, office_id, name, is_active`,
      [officeId, name],
    );
    return rows[0]!;
  }
  async listFloors(officeId: number, includeInactive = false): Promise<FloorRow[]> {
    const { rows } = await this.db.query<FloorRow>(
      `SELECT id, office_id, name, is_active FROM floor
        WHERE office_id = $1 AND ($2 OR is_active) ORDER BY name`,
      [officeId, includeInactive],
    );
    return rows;
  }
  async getFloor(id: number): Promise<FloorRow | null> {
    const { rows } = await this.db.query<FloorRow>(
      `SELECT id, office_id, name, is_active FROM floor WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }
  async updateFloor(
    id: number,
    fields: { name?: string; isActive?: boolean },
  ): Promise<FloorRow | null> {
    const { rows } = await this.db.query<FloorRow>(
      `UPDATE floor SET
         name = COALESCE($2, name),
         is_active = COALESCE($3, is_active)
       WHERE id = $1
       RETURNING id, office_id, name, is_active`,
      [id, fields.name ?? null, fields.isActive ?? null],
    );
    return rows[0] ?? null;
  }
  async countRooms(floorId: number): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM room WHERE floor_id = $1',
      [floorId],
    );
    return Number(rows[0]!.n);
  }
  async deleteFloor(id: number): Promise<void> {
    await this.db.query('DELETE FROM floor WHERE id = $1', [id]);
  }

  // ---- Rooms ---------------------------------------------------------------
  async createRoom(
    floorId: number,
    name: string,
    capacity: number,
    facilityIds: number[],
  ): Promise<RoomRow> {
    return this.db.tx(async (client) => {
      const { rows } = await client.query<RoomRow>(
        `INSERT INTO room (floor_id, name, capacity) VALUES ($1, $2, $3)
         RETURNING id, floor_id, name, capacity, is_active`,
        [floorId, name, capacity],
      );
      const room = rows[0]!;
      await this.replaceRoomFacilities(client, room.id, facilityIds);
      return room;
    });
  }
  async getRoom(id: number): Promise<RoomRow | null> {
    const { rows } = await this.db.query<RoomRow>(
      `SELECT id, floor_id, name, capacity, is_active FROM room WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }
  async listRoomsByFloor(floorId: number, includeInactive = false): Promise<RoomRow[]> {
    const { rows } = await this.db.query<RoomRow>(
      `SELECT id, floor_id, name, capacity, is_active FROM room
        WHERE floor_id = $1 AND ($2 OR is_active) ORDER BY name`,
      [floorId, includeInactive],
    );
    return rows;
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
  ): Promise<RoomRow | null> {
    return this.db.tx(async (client) => {
      const { rows } = await client.query<RoomRow>(
        `UPDATE room SET
           name = COALESCE($2, name),
           capacity = COALESCE($3, capacity),
           floor_id = COALESCE($4, floor_id),
           is_active = COALESCE($5, is_active)
         WHERE id = $1
         RETURNING id, floor_id, name, capacity, is_active`,
        [
          id,
          fields.name ?? null,
          fields.capacity ?? null,
          fields.floorId ?? null,
          fields.isActive ?? null,
        ],
      );
      const room = rows[0] ?? null;
      if (room && fields.facilityIds) {
        await this.replaceRoomFacilities(client, id, fields.facilityIds);
      }
      return room;
    });
  }
  async countBookings(roomId: number): Promise<number> {
    const { rows } = await this.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM booking WHERE room_id = $1',
      [roomId],
    );
    return Number(rows[0]!.n);
  }
  async deleteRoom(id: number): Promise<void> {
    await this.db.query('DELETE FROM room WHERE id = $1', [id]);
  }
  async getRoomFacilityIds(roomId: number): Promise<number[]> {
    const { rows } = await this.db.query<{ facility_id: number }>(
      'SELECT facility_id FROM room_facility WHERE room_id = $1 ORDER BY facility_id',
      [roomId],
    );
    return rows.map((r) => r.facility_id);
  }
  private async replaceRoomFacilities(
    client: { query: Db['query'] },
    roomId: number,
    facilityIds: number[],
  ): Promise<void> {
    await client.query('DELETE FROM room_facility WHERE room_id = $1', [roomId]);
    const unique = [...new Set(facilityIds)];
    for (const fid of unique) {
      await client.query(
        'INSERT INTO room_facility (room_id, facility_id) VALUES ($1, $2)',
        [roomId, fid],
      );
    }
  }

  // ---- Facilities ----------------------------------------------------------
  async createFacility(name: string): Promise<FacilityRow> {
    const { rows } = await this.db.query<FacilityRow>(
      `INSERT INTO facility (name) VALUES ($1)
       RETURNING id, name, is_active`,
      [name],
    );
    return rows[0]!;
  }
  async listFacilities(includeInactive = false): Promise<FacilityRow[]> {
    const { rows } = await this.db.query<FacilityRow>(
      `SELECT id, name, is_active FROM facility WHERE ($1 OR is_active) ORDER BY name`,
      [includeInactive],
    );
    return rows;
  }
  async getFacility(id: number): Promise<FacilityRow | null> {
    const { rows } = await this.db.query<FacilityRow>(
      'SELECT id, name, is_active FROM facility WHERE id = $1',
      [id],
    );
    return rows[0] ?? null;
  }
  async updateFacility(
    id: number,
    fields: { name?: string; isActive?: boolean },
  ): Promise<FacilityRow | null> {
    const { rows } = await this.db.query<FacilityRow>(
      `UPDATE facility SET
         name = COALESCE($2, name),
         is_active = COALESCE($3, is_active)
       WHERE id = $1
       RETURNING id, name, is_active`,
      [id, fields.name ?? null, fields.isActive ?? null],
    );
    return rows[0] ?? null;
  }
  async facilitiesExist(ids: number[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const { rows } = await this.db.query<{ n: string }>(
      'SELECT count(*)::text AS n FROM facility WHERE id = ANY($1) AND is_active',
      [ids],
    );
    return Number(rows[0]!.n) === new Set(ids).size;
  }
}
