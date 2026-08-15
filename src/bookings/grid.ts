import { ValidationError } from '../lib/errors.js';

export interface BookingPolicy {
  slotMinutes: number;
  maxDurationMinutes: number;
  horizonDays: number;
  /** Org display timezone — defines the "today" boundary for retroactive bookings. */
  orgDisplayTz: string;
}

export interface BookingWindow {
  start: Date;
  end: Date;
}

/** UTC offset (ms) that `tz` is ahead of UTC at the given instant. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  );
  return asUTC - date.getTime();
}

/** Instant (ms) of local midnight for `now`'s calendar day in `tz`. */
export function startOfDayMs(now: Date, tz: string): number {
  const off = tzOffsetMs(now, tz);
  const local = new Date(now.getTime() + off);
  const localMidnightAsUTC = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  return localMidnightAsUTC - off;
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

  // Retroactive same-day booking (F-retro): you may book a window whose start is
  // already in the past — e.g. reserve 09:00–17:00 at 14:00 — as long as the
  // window has not fully ended and its start is still within *today* (org tz).
  // This lets people formalise a meeting already under way without letting them
  // resurrect slots from a previous day.
  if (end.getTime() <= now.getTime()) {
    throw new ValidationError('cannot book a slot that has already ended');
  }
  if (start.getTime() < startOfDayMs(now, policy.orgDisplayTz)) {
    throw new ValidationError('retroactive bookings are limited to the current day');
  }

  const horizonMs = policy.horizonDays * 24 * 60 * 60_000;
  if (end.getTime() > now.getTime() + horizonMs) {
    throw new ValidationError(
      `booking is beyond the allowed horizon of ${policy.horizonDays} days`,
    );
  }

  return { start, end };
}
