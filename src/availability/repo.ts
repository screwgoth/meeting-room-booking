import type { Db } from '../lib/db.js';

const ISO_FMT = `'YYYY-MM-DD"T"HH24:MI:SS"Z"'`;

export interface WindowBounds {
  gridStart: string;
  gridEnd: string;
  filterStart: string | null;
  filterEnd: string | null;
}

export interface AvailRoomRow {
  id: number;
  name: string;
  capacity: number;
  floor_id: number;
  floor_name: string;
}

export interface AvailFacilityRow {
  room_id: number;
  facility_id: number;
  facility_name: string;
}

export interface AvailBookingRow {
  id: number;
  room_id: number;
  user_id: number;
  title: string;
  start: string;
  end: string;
}

/**
 * Read model for the availability grid (F4, NF4). Live queries only — no cache
 * tier, so free/busy is never stale by construction (§3). All time-window math
 * is resolved in Postgres against the org display tz so DST is handled for us.
 */
export class AvailabilityRepo {
  constructor(private readonly db: Db) {}

  /**
   * Resolve the 08:00–20:00 grid window (and the optional filter sub-window)
   * for `date` in `tz`, returned as UTC ISO8601 strings.
   */
  async resolveWindow(
    date: string,
    tz: string,
    filterStart: string | null,
    filterEnd: string | null,
  ): Promise<WindowBounds> {
    const { rows } = await this.db.query<{
      grid_start: string;
      grid_end: string;
      filter_start: string | null;
      filter_end: string | null;
    }>(
      `SELECT
         to_char((($1::date + time '08:00') AT TIME ZONE $2) AT TIME ZONE 'UTC', ${ISO_FMT}) AS grid_start,
         to_char((($1::date + time '20:00') AT TIME ZONE $2) AT TIME ZONE 'UTC', ${ISO_FMT}) AS grid_end,
         CASE WHEN $3::time IS NULL THEN NULL
              ELSE to_char((($1::date + $3::time) AT TIME ZONE $2) AT TIME ZONE 'UTC', ${ISO_FMT})
         END AS filter_start,
         CASE WHEN $4::time IS NULL THEN NULL
              ELSE to_char((($1::date + $4::time) AT TIME ZONE $2) AT TIME ZONE 'UTC', ${ISO_FMT})
         END AS filter_end`,
      [date, tz, filterStart, filterEnd],
    );
    const r = rows[0]!;
    return {
      gridStart: r.grid_start,
      gridEnd: r.grid_end,
      filterStart: r.filter_start,
      filterEnd: r.filter_end,
    };
  }

  /** Active rooms in an office, optionally scoped to one floor. */
  async listRooms(officeId: number, floorId: number | null): Promise<AvailRoomRow[]> {
    const { rows } = await this.db.query<AvailRoomRow>(
      `SELECT r.id, r.name, r.capacity, f.id AS floor_id, f.name AS floor_name
         FROM room r
         JOIN floor f  ON f.id = r.floor_id
         JOIN office o ON o.id = f.office_id
        WHERE o.id = $1 AND o.is_active AND f.is_active AND r.is_active
          AND ($2::bigint IS NULL OR f.id = $2)
        ORDER BY f.name, r.name`,
      [officeId, floorId],
    );
    return rows;
  }

  async listFacilities(roomIds: number[]): Promise<AvailFacilityRow[]> {
    if (roomIds.length === 0) return [];
    const { rows } = await this.db.query<AvailFacilityRow>(
      `SELECT rf.room_id, fac.id AS facility_id, fac.name AS facility_name
         FROM room_facility rf
         JOIN facility fac ON fac.id = rf.facility_id
        WHERE rf.room_id = ANY($1) AND fac.is_active
        ORDER BY fac.name`,
      [roomIds],
    );
    return rows;
  }

  /** Confirmed bookings overlapping the grid window for the given rooms. */
  async listBookings(
    roomIds: number[],
    gridStart: string,
    gridEnd: string,
  ): Promise<AvailBookingRow[]> {
    if (roomIds.length === 0) return [];
    const { rows } = await this.db.query<AvailBookingRow>(
      `SELECT b.id, b.room_id, b.user_id, b.title,
              to_char(lower(b.during) AT TIME ZONE 'UTC', ${ISO_FMT}) AS start,
              to_char(upper(b.during) AT TIME ZONE 'UTC', ${ISO_FMT}) AS "end"
         FROM booking b
        WHERE b.room_id = ANY($1)
          AND b.status = 'confirmed'
          AND b.during && tstzrange($2::timestamptz, $3::timestamptz, '[)')
        ORDER BY lower(b.during)`,
      [roomIds, gridStart, gridEnd],
    );
    return rows;
  }
}
