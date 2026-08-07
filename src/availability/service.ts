import type { Config } from '../config.js';
import { ValidationError } from '../lib/errors.js';
import type { AvailabilityRepo, AvailBookingRow } from './repo.js';

const GRID_WINDOW = { start: '08:00', end: '20:00' } as const;
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface AvailabilityQuery {
  officeId: number;
  date: string; // YYYY-MM-DD
  floorId?: number;
  start?: string; // HH:MM
  end?: string; // HH:MM
  capacity?: number;
  facilityIds?: number[];
}

interface RoomBookingOut {
  id: number;
  start: string;
  end: string;
  title: string;
  is_mine: boolean;
}

interface AvailabilityRoomOut {
  id: number;
  name: string;
  floor: { id: number; name: string };
  capacity: number;
  facilities: { id: number; name: string }[];
  bookings: RoomBookingOut[];
  fits?: boolean;
  free_in_window?: boolean;
}

export interface AvailabilityResponse {
  date: string;
  timezone: string;
  window: { start: string; end: string };
  rooms: AvailabilityRoomOut[];
}

/** True when booking [bStart,bEnd) overlaps [wStart,wEnd) — half-open. */
function overlaps(bStart: string, bEnd: string, wStart: Date, wEnd: Date): boolean {
  return new Date(bStart) < wEnd && new Date(bEnd) > wStart;
}

/**
 * Availability + filtering (F4/F5). Composes the live read model into the grid
 * contract the frontend expects. Filters are additive: capacity + "has all
 * required facilities" set `fits`; a start/end time filter sets
 * `free_in_window`. Neither ever removes a room — the grid shows every room and
 * flags which qualify (matches the mock/API contract types).
 */
export class AvailabilityService {
  constructor(
    private readonly repo: AvailabilityRepo,
    private readonly config: Config,
  ) {}

  async query(q: AvailabilityQuery, viewerId: number): Promise<AvailabilityResponse> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(q.date)) {
      throw new ValidationError('date must be YYYY-MM-DD');
    }
    if (q.start !== undefined && !HHMM.test(q.start)) {
      throw new ValidationError('start must be HH:MM');
    }
    if (q.end !== undefined && !HHMM.test(q.end)) {
      throw new ValidationError('end must be HH:MM');
    }
    const hasTimeFilter = q.start !== undefined && q.end !== undefined;
    if (hasTimeFilter && q.start! >= q.end!) {
      throw new ValidationError('start must be before end');
    }
    const hasFitFilter = q.capacity !== undefined || (q.facilityIds?.length ?? 0) > 0;

    const tz = this.config.orgDisplayTz;
    const win = await this.repo.resolveWindow(
      q.date,
      tz,
      hasTimeFilter ? q.start! : null,
      hasTimeFilter ? q.end! : null,
    );

    const rooms = await this.repo.listRooms(q.officeId, q.floorId ?? null);
    const roomIds = rooms.map((r) => r.id);
    const [facilityRows, bookingRows] = await Promise.all([
      this.repo.listFacilities(roomIds),
      this.repo.listBookings(roomIds, win.gridStart, win.gridEnd),
    ]);

    const facByRoom = new Map<number, { id: number; name: string }[]>();
    for (const f of facilityRows) {
      const list = facByRoom.get(f.room_id) ?? [];
      list.push({ id: f.facility_id, name: f.facility_name });
      facByRoom.set(f.room_id, list);
    }
    const bookingsByRoom = new Map<number, AvailBookingRow[]>();
    for (const b of bookingRows) {
      const list = bookingsByRoom.get(b.room_id) ?? [];
      list.push(b);
      bookingsByRoom.set(b.room_id, list);
    }

    const requiredFacilities = new Set(q.facilityIds ?? []);
    const filterStart = win.filterStart ? new Date(win.filterStart) : null;
    const filterEnd = win.filterEnd ? new Date(win.filterEnd) : null;

    const roomsOut: AvailabilityRoomOut[] = rooms.map((r) => {
      const facilities = facByRoom.get(r.id) ?? [];
      const bookings = (bookingsByRoom.get(r.id) ?? []).map((b) => ({
        id: b.id,
        start: b.start,
        end: b.end,
        title: b.title,
        is_mine: b.user_id === viewerId,
      }));

      const out: AvailabilityRoomOut = {
        id: r.id,
        name: r.name,
        floor: { id: r.floor_id, name: r.floor_name },
        capacity: r.capacity,
        facilities,
        bookings,
      };

      if (hasFitFilter) {
        const capacityOk = q.capacity === undefined || r.capacity >= q.capacity;
        const facilityIds = new Set(facilities.map((f) => f.id));
        const facilitiesOk = [...requiredFacilities].every((id) => facilityIds.has(id));
        out.fits = capacityOk && facilitiesOk;
      }

      if (filterStart && filterEnd) {
        out.free_in_window = !bookings.some((b) =>
          overlaps(b.start, b.end, filterStart, filterEnd),
        );
      }

      return out;
    });

    return {
      date: q.date,
      timezone: tz,
      window: { start: GRID_WINDOW.start, end: GRID_WINDOW.end },
      rooms: roomsOut,
    };
  }
}
