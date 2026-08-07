// Time + 15-min grid math for the availability grid.
//
// Locked design (ARCHITECTURE §5a / D1): the rendered window is 08:00–20:00 in the
// org display timezone, 48 fifteen-minute cells/day. All booking instants are stored
// UTC (ISO8601 `Z`); we convert to the org tz purely for presentation and for mapping
// bookings onto grid cells. Never store or reason in server-local wall time.

export const GRID_START_HOUR = 8
export const GRID_END_HOUR = 20
export const SLOT_MINUTES = 15
export const SLOTS_PER_HOUR = 60 / SLOT_MINUTES
export const SLOT_COUNT = (GRID_END_HOUR - GRID_START_HOUR) * SLOTS_PER_HOUR // 48

/** Test seam: override "now" deterministically. Prod reads the real clock. */
let nowOverride: number | null = null
export function __setNow(ms: number | null) {
  nowOverride = ms
}
export function now(): Date {
  return new Date(nowOverride ?? Date.now())
}

/** Wall-clock hour/minute of a UTC instant, as rendered in `tz`. */
export function zonedHM(instant: Date | string, tz: string): { h: number; m: number } {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(d)
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  let h = Number(map.hour)
  if (h === 24) h = 0 // some engines emit "24" for midnight
  return { h, m: Number(map.minute) }
}

/** Minutes since the grid start (08:00) for a UTC instant rendered in `tz`. */
export function minutesFromGridStart(instant: Date | string, tz: string): number {
  const { h, m } = zonedHM(instant, tz)
  return (h - GRID_START_HOUR) * 60 + m
}

/** Fractional slot index (0..SLOT_COUNT) for an instant; clamps to the window. */
export function slotIndex(instant: Date | string, tz: string): number {
  const mins = minutesFromGridStart(instant, tz)
  return Math.max(0, Math.min(SLOT_COUNT, mins / SLOT_MINUTES))
}

/** tz offset (ms) such that local = utc + offset, for the given instant. */
function tzOffsetMs(utc: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const map: Record<string, string> = {}
  for (const p of dtf.formatToParts(utc)) map[p.type] = p.value
  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    map.hour === '24' ? 0 : Number(map.hour),
    Number(map.minute),
    Number(map.second),
  )
  return asUTC - utc.getTime()
}

/**
 * Convert a wall-clock time (dateStr `YYYY-MM-DD`, hh:mm) *in tz* to a UTC instant.
 * Used to build booking POST payloads from the filtered window (§5a: book exactly
 * the filtered window). DST-correct via a single offset-correction pass.
 */
export function zonedWallToUtc(dateStr: string, hh: number, mm: number, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const guess = Date.UTC(y, mo - 1, d, hh, mm, 0)
  const off1 = tzOffsetMs(new Date(guess), tz)
  let result = new Date(guess - off1)
  const off2 = tzOffsetMs(result, tz)
  if (off2 !== off1) result = new Date(guess - off2)
  return result
}

/** Format a UTC instant as `HH:mm` in tz, tabular-friendly. */
export function fmtTime(instant: Date | string, tz: string): string {
  const { h, m } = zonedHM(instant, tz)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Format a UTC instant as a friendly date, e.g. "Wed, 6 Aug" in tz. */
export function fmtDate(instant: Date | string, tz: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
}

const WINDOW_MINUTES = (GRID_END_HOUR - GRID_START_HOUR) * 60 // 720

/** Horizontal % (0–100) across the 08:00–20:00 track for a minutes-from-grid-start
 * value. Clamped so out-of-window bookings still paint at the track edge. */
export function pctFromGridMinutes(mins: number): number {
  return Math.max(0, Math.min(100, (mins / WINDOW_MINUTES) * 100))
}

/** Horizontal % across the track for a UTC instant, rendered in `tz`. */
export function instantPct(instant: Date | string, tz: string): number {
  return pctFromGridMinutes(minutesFromGridStart(instant, tz))
}

/** True when the instant is at or before "now" (grey-out passed slots, §5a). */
export function isPast(instant: Date | string): boolean {
  const d = typeof instant === 'string' ? new Date(instant) : instant
  return d.getTime() <= now().getTime()
}

/** `HH:mm` label for a slot index within the window (0 → "08:00"). */
export function slotLabel(index: number): string {
  const total = GRID_START_HOUR * 60 + index * SLOT_MINUTES
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Today's date string `YYYY-MM-DD` as rendered in tz. */
export function todayInTz(tz: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now())
  const map: Record<string, string> = {}
  for (const p of parts) map[p.type] = p.value
  return `${map.year}-${map.month}-${map.day}`
}
