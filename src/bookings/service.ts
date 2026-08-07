import type { Config } from '../config.js';
import type { Principal } from '../auth/types.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';
import { validateBookingWindow, type BookingPolicy } from './grid.js';
import type { BookingRepo, BookingWithLocationRow } from './repo.js';

export interface Booking {
  id: number;
  room_id: number;
  location: { office: string; floor: string; room: string };
  start: string;
  end: string;
  title: string;
  attendee_count: number | null;
  status: 'confirmed' | 'cancelled';
}

export interface BookingWarning {
  code: 'attendees_over_capacity' | string;
  message: string;
}

export interface CreateBookingInput {
  roomId: number;
  startISO: string;
  endISO: string;
  title: string;
  attendeeCount: number | null;
}

/** Postgres exclusion_violation — the overlap guard firing (§2). */
const SQLSTATE_EXCLUSION_VIOLATION = '23P01';

function isPgError(err: unknown): err is { code: string } {
  return typeof err === 'object' && err !== null && typeof (err as { code?: unknown }).code === 'string';
}

export function serializeBooking(row: BookingWithLocationRow): Booking {
  return {
    id: row.id,
    room_id: row.room_id,
    location: { office: row.office_name, floor: row.floor_name, room: row.room_name },
    start: row.start,
    end: row.end,
    title: row.title,
    attendee_count: row.attendee_count,
    status: row.status,
  };
}

/**
 * Booking rules (#7/#8). Validates the window in-app for precise 4xx errors,
 * then relies on the DB EXCLUDE constraint as the non-bypassable overlap
 * guarantee — SQLSTATE 23P01 becomes a 409 (§2). Capacity is a soft warning,
 * never a rejection (§2 / §5a design lock).
 */
export class BookingService {
  private readonly policy: BookingPolicy;

  constructor(
    private readonly repo: BookingRepo,
    config: Config,
  ) {
    this.policy = {
      slotMinutes: config.slotMinutes,
      maxDurationMinutes: config.maxDurationMinutes,
      horizonDays: config.horizonDays,
    };
  }

  async create(
    userId: number,
    input: CreateBookingInput,
  ): Promise<{ booking: Booking; warnings: BookingWarning[] }> {
    // Grid alignment / past / horizon / duration → 422 before we touch the DB.
    validateBookingWindow(input.startISO, input.endISO, this.policy);

    const room = await this.repo.getRoomForBooking(input.roomId);
    if (!room || !room.is_active) {
      throw new ValidationError('Room does not exist or is not active');
    }

    const warnings: BookingWarning[] = [];
    if (input.attendeeCount !== null && input.attendeeCount > room.capacity) {
      warnings.push({
        code: 'attendees_over_capacity',
        message: `Room seats ${room.capacity}, but you entered ${input.attendeeCount} attendees.`,
      });
    }

    let row: BookingWithLocationRow;
    try {
      row = await this.repo.insertBooking({
        roomId: input.roomId,
        userId,
        startISO: input.startISO,
        endISO: input.endISO,
        title: input.title,
        attendeeCount: input.attendeeCount,
      });
    } catch (err) {
      if (isPgError(err) && err.code === SQLSTATE_EXCLUSION_VIOLATION) {
        throw new ConflictError('That room was just taken for the selected time.');
      }
      throw err;
    }

    return { booking: serializeBooking(row), warnings };
  }

  async myBookings(userId: number): Promise<{ upcoming: Booking[]; past: Booking[] }> {
    const [upcoming, past] = await Promise.all([
      this.repo.listUpcoming(userId),
      this.repo.listPast(userId),
    ]);
    return {
      upcoming: upcoming.map(serializeBooking),
      past: past.map(serializeBooking),
    };
  }

  async cancel(principal: Principal, id: number, reason: string | null): Promise<Booking> {
    const existing = await this.repo.getById(id);
    if (!existing) throw new NotFoundError('Booking not found');
    // Owner or admin only (§7 authz at the boundary).
    if (existing.user_id !== principal.id && principal.role !== 'ADMIN') {
      throw new ForbiddenError('You can only cancel your own bookings');
    }
    if (existing.status !== 'confirmed') {
      throw new ConflictError('Booking is already cancelled');
    }
    const row = await this.repo.cancel(id, principal.id, reason);
    if (!row) {
      // Lost a race with a concurrent cancel — treat as already cancelled.
      throw new ConflictError('Booking is already cancelled');
    }
    return serializeBooking(row);
  }
}
