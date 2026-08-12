import type { AvailabilityRoom } from '@/api'

export interface GroupedRooms {
  /** Fits capacity + facilities AND free for the whole window — the money list. */
  fitsFree: AvailabilityRoom[]
  /** Fits, but taken somewhere in the window — nudge your time. */
  fitsBusy: AvailabilityRoom[]
  /** Doesn't match capacity/facilities — dimmed at the bottom. */
  nonFit: AvailabilityRoom[]
}

/** Split rooms into the three timeline sections (design thesis: fitting-and-free
 * floats to the top, fitting-but-busy sits below, non-matching is dimmed last).
 * `fits`/`free_in_window` are undefined when the corresponding filter is absent —
 * treated as "matches" so an unfiltered room still reads as bookable. */
export function groupRooms(rooms: AvailabilityRoom[]): GroupedRooms {
  const fitsFree: AvailabilityRoom[] = []
  const fitsBusy: AvailabilityRoom[] = []
  const nonFit: AvailabilityRoom[] = []
  for (const r of rooms) {
    const fits = r.fits !== false
    const free = r.free_in_window !== false
    if (!fits) nonFit.push(r)
    else if (free) fitsFree.push(r)
    else fitsBusy.push(r)
  }
  return { fitsFree, fitsBusy, nonFit }
}
