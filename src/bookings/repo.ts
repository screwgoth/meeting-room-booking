import type { Db } from '../lib/db.js';

/** A booking joined to its room/floor/office, shaped for the API serializer. */
export interface BookingWithLocationRow {
  id: number;
  room_id: number;
  user_id: number;
  title: string;
  attendee_count: number | null;
  status: 'confirmed' | 'cancelled';
  start: string; // ISO8601Z (lower(during))
  end: string; // ISO8601Z (upper(during))
  office_name: string;
  floor_name: string;
  room_name: string;
}

export interface RoomForBooking {
  id: number;
  capacity: number;
  is_active: boolean;
}

export interface InsertBookingInput {
  roomId: number;
  userId: number;
  startISO: string;
  endISO: string;
  title: string;
  attendeeCount: number | null;
}

export interface UpdateBookingInput {
  id: number;
  roomId: number;
  startISO: string;
  endISO: string;
  title: string;
  attendeeCount: number | null;
}

const SELECT_WITH_LOCATION = `
  SELECT b.id, b.room_id, b.user_id, b.title, b.attendee_count, b.status,
         to_char(lower(b.during) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS start,
         to_char(upper(b.during) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "end",
         o.name AS office_name, f.name AS floor_name, r.name AS room_name
    FROM booking b
    JOIN room r   ON r.id = b.room_id
    JOIN floor f  ON f.id = r.floor_id
    JOIN office o ON o.id = f.office_id`;

/** Data access for bookings (#7/#8). All queries parameterized (§7). */
export class BookingRepo {
  constructor(private readonly db: Db) {}

  /**
   * Bookable = the room AND its whole ancestry are active (NF5). A soft-deleted
   * floor or office must hide every room under it from the write path, exactly
   * as availability does — a stale tab or crafted request can't book into a
   * deactivated branch. `is_active` here is the AND of all three levels.
   */
  async getRoomForBooking(roomId: number): Promise<RoomForBooking | null> {
    const { rows } = await this.db.query<RoomForBooking>(
      `SELECT r.id, r.capacity,
              (r.is_active AND f.is_active AND o.is_active) AS is_active
         FROM room r
         JOIN floor f  ON f.id = r.floor_id
         JOIN office o ON o.id = f.office_id
        WHERE r.id = $1`,
      [roomId],
    );
    return rows[0] ?? null;
  }

  /**
   * The money path (§2): a single-statement INSERT guarded by the
   * booking_no_overlap EXCLUDE constraint. No SELECT ... FOR UPDATE, no
   * pre-lock — the constraint is the guarantee. Returns the new row joined to
   * its location. Raises the raw pg error (SQLSTATE 23P01 on overlap) so the
   * service can translate it.
   */
  async insertBooking(input: InsertBookingInput): Promise<BookingWithLocationRow> {
    return this.db.tx(async (client) => {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO booking (room_id, user_id, during, title, attendee_count)
         VALUES ($1, $2, tstzrange($3::timestamptz, $4::timestamptz, '[)'), $5, $6)
         RETURNING id`,
        [input.roomId, input.userId, input.startISO, input.endISO, input.title, input.attendeeCount],
      );
      const id = inserted.rows[0]!.id;
      const { rows } = await client.query<BookingWithLocationRow>(
        `${SELECT_WITH_LOCATION} WHERE b.id = $1`,
        [id],
      );
      return rows[0]!;
    });
  }

  /**
   * Edit an own upcoming booking (F11). A reschedule is an overlap-checked
   * UPDATE: the same booking_no_overlap EXCLUDE constraint (§2) arbitrates the
   * new (room_id, during) exactly as it does an INSERT — Postgres checks the
   * updated row against every OTHER confirmed row, so a booking never conflicts
   * with itself (a pure title/attendee edit, or a shrink/extend on the same
   * room, can't collide). No pre-lock; a 23P01 propagates for the service to
   * map to 409. Guarded on status='confirmed' so it can't resurrect a cancelled
   * booking or race a concurrent cancel. Returns null if no confirmed row
   * matched (already cancelled between the service's read and this write).
   */
  async updateBooking(input: UpdateBookingInput): Promise<BookingWithLocationRow | null> {
    return this.db.tx(async (client) => {
      const updated = await client.query<{ id: number }>(
        `UPDATE booking
            SET room_id = $2,
                during = tstzrange($3::timestamptz, $4::timestamptz, '[)'),
                title = $5,
                attendee_count = $6,
                updated_at = now()
          WHERE id = $1 AND status = 'confirmed'
          RETURNING id`,
        [input.id, input.roomId, input.startISO, input.endISO, input.title, input.attendeeCount],
      );
      if (!updated.rows[0]) return null;
      const { rows } = await client.query<BookingWithLocationRow>(
        `${SELECT_WITH_LOCATION} WHERE b.id = $1`,
        [input.id],
      );
      return rows[0]!;
    });
  }

  async getById(id: number): Promise<BookingWithLocationRow | null> {
    const { rows } = await this.db.query<BookingWithLocationRow>(
      `${SELECT_WITH_LOCATION} WHERE b.id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * Cancel = status flip (F7). Only flips a currently-confirmed booking; the
   * partial EXCLUDE constraint (WHERE status='confirmed') means this frees the
   * slot the instant it commits. Returns null if the booking wasn't confirmed.
   */
  async cancel(
    id: number,
    cancelledBy: number,
    reason: string | null,
  ): Promise<BookingWithLocationRow | null> {
    const { rows } = await this.db.query<{ id: number }>(
      `UPDATE booking
          SET status = 'cancelled', cancelled_by = $2, cancel_reason = $3, updated_at = now()
        WHERE id = $1 AND status = 'confirmed'
        RETURNING id`,
      [id, cancelledBy, reason],
    );
    if (!rows[0]) return null;
    return this.getById(id);
  }

  /** Confirmed & not-yet-ended bookings for a user, soonest first (#8). */
  async listUpcoming(userId: number): Promise<BookingWithLocationRow[]> {
    const { rows } = await this.db.query<BookingWithLocationRow>(
      `${SELECT_WITH_LOCATION}
        WHERE b.user_id = $1 AND b.status = 'confirmed' AND upper(b.during) > now()
        ORDER BY lower(b.during) ASC`,
      [userId],
    );
    return rows;
  }

  /** Everything else for the user — ended or cancelled — most recent first (#8). */
  async listPast(userId: number): Promise<BookingWithLocationRow[]> {
    const { rows } = await this.db.query<BookingWithLocationRow>(
      `${SELECT_WITH_LOCATION}
        WHERE b.user_id = $1 AND (b.status = 'cancelled' OR upper(b.during) <= now())
        ORDER BY lower(b.during) DESC`,
      [userId],
    );
    return rows;
  }
}
