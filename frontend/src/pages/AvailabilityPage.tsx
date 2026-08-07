import { useMemo, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import type { AvailabilityRoom, Booking } from '@/api'
import { useToast } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Spinner'
import { isPast, zonedWallToUtc } from '@/lib/time'
import { defaultFilters, fromHM } from './availability/filters'
import { groupRooms } from './availability/grouping'
import { useAvailability } from './availability/useAvailability'
import { FilterRail } from './availability/FilterRail'
import { TimelineGrid } from './availability/TimelineGrid'
import { BookingPopover } from './availability/BookingPopover'

export function AvailabilityPage() {
  const { filters, setFilters, meta, data, loading, error, tz, refetch } = useAvailability()
  const [booking, setBooking] = useState<AvailabilityRoom | null>(null)
  const [railOpen, setRailOpen] = useState(false)
  const { push } = useToast()

  const rooms = data?.rooms ?? []
  const { fitsFree } = groupRooms(rooms)
  const freeCount = fitsFree.length

  // Filter signature keys the grid so a filter change replays the staggered rise; a
  // post-booking refetch (same signature) updates in place without re-animating.
  const signature = useMemo(() => JSON.stringify(filters), [filters])

  const windowPast = useMemo(() => {
    const [eh, em] = filters.end.split(':').map(Number)
    return isPast(zonedWallToUtc(filters.date, eh, em, tz))
  }, [filters.end, filters.date, tz])

  const facLabel =
    filters.facilities.length === 0
      ? 'any facilities'
      : meta.facilities
          .filter((f) => filters.facilities.includes(f.id))
          .map((f) => f.name)
          .join(', ')
  const officeName = meta.offices.find((o) => o.id === filters.office)?.name ?? ''

  function onReset() {
    setFilters({ ...defaultFilters(tz), office: filters.office })
  }

  function onBooked(b: Booking) {
    setBooking(null)
    push('success', `Booked ${b.location.room} · ${filters.start}–${filters.end} · “${b.title}”`)
    void refetch(filters) // reflect the new booking without re-animating the list
  }

  const durMins = fromHM(filters.end) - fromHM(filters.start)

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)]">
      <FilterRail
        filters={filters}
        onChange={setFilters}
        offices={meta.offices}
        floors={meta.floors}
        facilities={meta.facilities}
        resultCount={freeCount}
        tz={tz}
        onReset={onReset}
        open={railOpen}
        onClose={() => setRailOpen(false)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-border bg-surface px-6 py-4">
          <div>
            <div className="font-display text-lg font-semibold tracking-tight text-ink">
              <span key={freeCount} className="text-accent motion-safe:animate-[count-pop_.42s_cubic-bezier(.3,1.4,.4,1)] inline-block">
                {freeCount}
              </span>{' '}
              {freeCount === 1 ? 'room' : 'rooms'} free for{' '}
              <span className="tnum">
                {filters.start}–{filters.end}
              </span>
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-3">
              {durMins > 0 ? `${durMins} min` : 'invalid window'} · seats {filters.capacity}+ · {facLabel}
              {officeName && ` · ${officeName}`}
            </div>
          </div>
          <button
            onClick={() => setRailOpen(true)}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-[13px] font-medium text-ink-2 md:hidden"
          >
            <SlidersHorizontal className="h-4 w-4" /> Filters
          </button>
        </div>

        {/* Body */}
        <div className="relative flex-1 overflow-auto">
          {loading && (
            <div className="grid place-items-center py-24 text-accent">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          {!loading && error && (
            <div className="mx-auto max-w-md px-6 py-20 text-center">
              <p className="text-sm text-danger-ink">{error}</p>
              <button
                onClick={() => refetch(filters)}
                className="mt-3 text-sm font-semibold text-accent"
              >
                Retry
              </button>
            </div>
          )}
          {!loading && !error && (
            <TimelineGrid
              key={signature}
              rooms={rooms}
              filters={filters}
              tz={tz}
              windowPast={windowPast}
              animate
              onBook={setBooking}
              onReset={onReset}
            />
          )}
        </div>
      </main>

      {booking && (
        <BookingPopover
          room={booking}
          filters={filters}
          tz={tz}
          onClose={() => setBooking(null)}
          onBooked={onBooked}
        />
      )}
    </div>
  )
}
