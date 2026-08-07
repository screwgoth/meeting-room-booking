import { ValidationError } from '../lib/errors.js';

export interface BookingPolicy {
  slotMinutes: number;
  maxDurationMinutes: number;
  horizonDays: number;
}

export interface BookingWindow {
  start: Date;
  end: Date;
}

/**
 * D1 grid guard + policy validation (§2 "API contract for Sam"), applied
 * BEFORE insert and separate from the overlap guarantee. Rejects unless:
 *  - start/end are valid instants,
 *  - both land on slot boundaries (:00/:15/:30/:45 for 15-min slots),
 *  - end > start and duration is a whole number of slots,
 *  - duration <= max, end within horizon, start not in the past (§5a).
 *
 * The DB CHECK + EXCLUDE constraint are the non-bypassable floor; this returns
 * specific, user-facing errors instead of a raw 23xxx.
 */
export function validateBookingWindow(
  startISO: string,
  endISO: string,
  policy: BookingPolicy,
  now: Date = new Date(),
): BookingWindow {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new ValidationError('start and end must be valid ISO-8601 timestamps');
  }

  const slotMs = policy.slotMinutes * 60_000;
  if (start.getTime() % slotMs !== 0 || end.getTime() % slotMs !== 0) {
    throw new ValidationError(
      `start and end must align to ${policy.slotMinutes}-minute boundaries`,
    );
  }

  if (end.getTime() <= start.getTime()) {
    throw new ValidationError('end must be after start');
  }

  const durationMs = end.getTime() - start.getTime();
  if (durationMs % slotMs !== 0) {
    throw new ValidationError(
      `duration must be a whole number of ${policy.slotMinutes}-minute slots`,
    );
  }
  if (durationMs > policy.maxDurationMinutes * 60_000) {
    throw new ValidationError(
      `booking exceeds the maximum duration of ${policy.maxDurationMinutes} minutes`,
    );
  }

  if (start.getTime() < now.getTime()) {
    throw new ValidationError('cannot book a slot in the past');
  }

  const horizonMs = policy.horizonDays * 24 * 60 * 60_000;
  if (end.getTime() > now.getTime() + horizonMs) {
    throw new ValidationError(
      `booking is beyond the allowed horizon of ${policy.horizonDays} days`,
    );
  }

  return { start, end };
}
