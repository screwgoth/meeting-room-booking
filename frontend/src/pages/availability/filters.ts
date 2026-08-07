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
