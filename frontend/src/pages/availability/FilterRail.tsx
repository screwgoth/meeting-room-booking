import { ChevronDown, ChevronLeft, ChevronRight, Lock, MapPin, Minus, Plus } from 'lucide-react'
import type { Facility, Floor, Office } from '@/api'
import { cn } from '@/lib/utils'
import { todayInTz } from '@/lib/time'
import { facilityIcon } from '@/lib/facilityIcon'
import {
  DURATION_CHIPS,
  dateLabel,
  durationMinutes,
  fromHM,
  relativeDateLabel,
  shiftDate,
  toHM,
  type Filters,
} from './filters'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  offices: Office[]
  floors: Floor[]
  facilities: Facility[]
  resultCount: number
  tz: string
  onReset: () => void
  /** Mobile: rail is an off-canvas sheet; parent controls open state. */
  open?: boolean
  onClose?: () => void
}

const CHIP_LABEL: Record<number, string> = { 15: '15 min', 30: '30 min', 60: '1 hr', 90: '90 min', 120: '2 hr' }

export function FilterRail({
  filters,
  onChange,
  offices,
  floors,
  facilities,
  resultCount,
  tz,
  onReset,
  open,
  onClose,
}: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch })
  const today = todayInTz(tz)
  const dur = durationMinutes(filters)

  const setStart = (v: string) => {
    // Keep the window's duration when the start moves.
    const nextStart = fromHM(v)
    set({ start: toHM(nextStart), end: toHM(nextStart + dur) })
  }
  const setEnd = (v: string) => {
    const nextEnd = fromHM(v)
    set({ end: toHM(Math.max(nextEnd, fromHM(filters.start) + 15)) })
  }
  const setDuration = (mins: number) => set({ end: toHM(fromHM(filters.start) + mins) })
  const toggleFacility = (id: number) =>
    set({
      facilities: filters.facilities.includes(id)
        ? filters.facilities.filter((x) => x !== id)
        : [...filters.facilities, id],
    })

  return (
    <>
      {open && (
        <button
          className="fixed inset-0 top-14 z-40 bg-ink/12 backdrop-blur-[1px] md:hidden"
          aria-label="Close filters"
          onClick={onClose}
        />
      )}
      <aside
        className={cn(
          'flex w-72 shrink-0 flex-col overflow-y-auto border-r border-border bg-rail',
          'max-md:fixed max-md:inset-y-0 max-md:top-14 max-md:z-50 max-md:shadow-pop max-md:transition-transform',
          open ? 'max-md:translate-x-0' : 'max-md:-translate-x-full',
        )}
        aria-label="Filters"
      >
        <div className="p-[18px] pb-6">
          <h2 className="mb-3.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
            <MapPin className="h-3.5 w-3.5" /> Find a room
          </h2>

          {/* Location — first filter dimension; multi-site slots in here later */}
          <div className="mb-5">
            <label htmlFor="f-office" className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
              Location
              <span className="inline-flex items-center gap-1 rounded-full bg-warn-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-warn">
                <Lock className="h-2.5 w-2.5" /> single site
              </span>
            </label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
              <select
                id="f-office"
                value={filters.office ?? ''}
                onChange={(e) => set({ office: Number(e.target.value), floor: null })}
                className="w-full appearance-none rounded-lg border border-border-strong bg-surface py-2.5 pl-9 pr-9 text-sm font-medium text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              >
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            </div>
            <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
              Multi-location slots in here as the first filter when we add more sites.
            </p>
          </div>

          {/* Floor — appears once the office has more than one floor */}
          {floors.length > 1 && (
            <div className="mb-5">
              <label htmlFor="f-floor" className="mb-2 block text-[12.5px] font-semibold text-ink-2">
                Floor
              </label>
              <div className="relative">
                <select
                  id="f-floor"
                  value={filters.floor ?? ''}
                  onChange={(e) => set({ floor: e.target.value ? Number(e.target.value) : null })}
                  className="w-full appearance-none rounded-lg border border-border-strong bg-surface py-2.5 pl-3 pr-9 text-sm font-medium text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                >
                  <option value="">Any floor</option>
                  {floors.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
              </div>
            </div>
          )}

          {/* Date */}
          <div className="mb-5">
            <label className="mb-2 block text-[12.5px] font-semibold text-ink-2">Date</label>
            <div className="flex items-stretch overflow-hidden rounded-lg border border-border-strong bg-surface">
              <button
                onClick={() => set({ date: shiftDate(filters.date, -1) })}
                aria-label="Previous day"
                className="grid w-9 place-items-center text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex flex-1 flex-col items-center justify-center border-x border-border py-1.5">
                <span className="text-[13.5px] font-semibold text-ink">{dateLabel(filters.date)}</span>
                <span className="mt-px text-[11px] text-ink-3">{relativeDateLabel(filters.date, today)}</span>
              </div>
              <button
                onClick={() => set({ date: shiftDate(filters.date, 1) })}
                aria-label="Next day"
                className="grid w-9 place-items-center text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            {filters.date !== today && (
              <button onClick={() => set({ date: today })} className="mt-2 text-[11.5px] font-semibold text-accent">
                Jump to today
              </button>
            )}
          </div>

          {/* Time window */}
          <div className="mb-5">
            <label className="mb-2 block text-[12.5px] font-semibold text-ink-2">Time window</label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute -top-1.5 left-2 bg-rail px-1 text-[10px] font-semibold text-ink-3">FROM</span>
                <input
                  type="time"
                  step={900}
                  value={filters.start}
                  onChange={(e) => setStart(e.target.value)}
                  aria-label="Start time"
                  className="tnum w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-center font-semibold text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                />
              </div>
              <span className="text-ink-3">–</span>
              <div className="relative flex-1">
                <span className="absolute -top-1.5 left-2 bg-rail px-1 text-[10px] font-semibold text-ink-3">TO</span>
                <input
                  type="time"
                  step={900}
                  value={filters.end}
                  onChange={(e) => setEnd(e.target.value)}
                  aria-label="End time"
                  className="tnum w-full rounded-lg border border-border-strong bg-surface px-2.5 py-2 text-center font-semibold text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                />
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {DURATION_CHIPS.map((mins) => {
                const on = dur === mins
                return (
                  <button
                    key={mins}
                    onClick={() => setDuration(mins)}
                    aria-pressed={on}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      on
                        ? 'border-accent bg-accent text-white'
                        : 'border-border-strong bg-surface text-ink-2 hover:border-accent hover:text-accent',
                    )}
                  >
                    {CHIP_LABEL[mins]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Capacity */}
          <div className="mb-5">
            <label className="mb-2 block text-[12.5px] font-semibold text-ink-2">People</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => set({ capacity: Math.max(1, filters.capacity - 1) })}
                disabled={filters.capacity <= 1}
                aria-label="Fewer people"
                className="grid h-9 w-9 place-items-center rounded-full border border-border-strong bg-surface text-ink transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:bg-surface disabled:hover:text-ink"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex-1 text-center" aria-live="polite">
                <b className="tnum text-[22px] font-bold tracking-tight text-ink">{filters.capacity}</b>
                <span className="block text-[11.5px] font-medium text-ink-3">need seats for</span>
              </div>
              <button
                onClick={() => set({ capacity: filters.capacity + 1 })}
                aria-label="More people"
                className="grid h-9 w-9 place-items-center rounded-full border border-border-strong bg-surface text-ink transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Facilities */}
          <div className="mb-5">
            <label className="mb-2 block text-[12.5px] font-semibold text-ink-2">Must have</label>
            <div className="flex flex-wrap gap-1.5">
              {facilities.map((f) => {
                const on = filters.facilities.includes(f.id)
                const Icon = facilityIcon(f.name)
                return (
                  <button
                    key={f.id}
                    onClick={() => toggleFacility(f.id)}
                    aria-pressed={on}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
                      on
                        ? 'border-accent bg-accent text-white'
                        : 'border-border-strong bg-surface text-ink-2 hover:border-accent hover:text-accent',
                    )}
                  >
                    <Icon className="h-[15px] w-[15px]" /> {f.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-1.5 flex items-center justify-between border-t border-border pt-4">
            <span className="text-[12.5px] text-ink-2">
              <b className="font-bold text-accent">{resultCount}</b> rooms fit &amp; free
            </span>
            <button onClick={onReset} className="text-[12.5px] font-semibold text-ink-3 transition-colors hover:text-danger">
              Reset
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
