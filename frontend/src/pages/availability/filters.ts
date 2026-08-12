import { GRID_END_HOUR, GRID_START_HOUR, SLOT_MINUTES, now, todayInTz, zonedHM } from '@/lib/time'

export interface Filters {
  office: number | null
  floor: number | null
  date: string // YYYY-MM-DD
  start: string // HH:MM
  end: string // HH:MM
  capacity: number
  facilities: number[]
}

export const DURATION_CHIPS = [15, 30, 60, 90, 120] as const

/** Round a minute value up to the next 15-min boundary. */
function ceilQuarter(mins: number): number {
  return Math.ceil(mins / SLOT_MINUTES) * SLOT_MINUTES
}

export function toHM(totalMinutes: number): string {
  const clamped = Math.max(GRID_START_HOUR * 60, Math.min(GRID_END_HOUR * 60, totalMinutes))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function fromHM(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return h * 60 + m
}

/** Default window: next quarter-hour from "now" (in org tz) for 60 min, clamped to
 * the 08:00–20:00 grid. Falls back to 09:00–10:00 when now is outside the window. */
export function defaultFilters(tz: string): Filters {
  const date = todayInTz(tz)
  const { h, m } = zonedHM(now(), tz)
  let startMin = ceilQuarter(h * 60 + m)
  if (startMin < GRID_START_HOUR * 60 || startMin >= GRID_END_HOUR * 60) startMin = 9 * 60
  const endMin = Math.min(startMin + 60, GRID_END_HOUR * 60)
  return {
    office: null,
    floor: null,
    date,
    start: toHM(startMin),
    end: toHM(endMin),
    capacity: 1,
    facilities: [],
  }
}

export function durationMinutes(f: Filters): number {
  return fromHM(f.end) - fromHM(f.start)
}

/** Shift a `YYYY-MM-DD` date string by whole days (tz-agnostic; noon anchor avoids
 * any DST/offset flip when we only care about the calendar date). */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12))
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate(),
  ).padStart(2, '0')}`
}

/** Friendly weekday+date label (e.g. "Thu, 7 Aug") for a `YYYY-MM-DD` string. */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

/** Relative label ("Today"/"Tomorrow"/"Yesterday"/"+N days") vs today in `tz`. */
export function relativeDateLabel(date: string, today: string): string {
  const diff = Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(today + 'T12:00:00Z')) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  return `${diff > 0 ? '+' : ''}${diff} days`
}
