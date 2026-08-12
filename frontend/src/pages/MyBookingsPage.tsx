import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, MapPin } from 'lucide-react'
import { api, ApiError } from '@/api'
import type { Booking, MyBookingsResponse } from '@/api'
import { useToast } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Spinner'
import { fmtDate, fmtTime } from '@/lib/time'

const TZ = 'Asia/Kolkata'

export function MyBookingsPage() {
  const [data, setData] = useState<MyBookingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<number | null>(null)
  const { push } = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await api.myBookings())
    } catch {
      setError('Could not load your bookings.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function cancel(b: Booking) {
    setCancelling(b.id)
    try {
      await api.cancelBooking(b.id)
      push('success', `Cancelled “${b.title}” · ${b.location.room} is free again`)
      await load()
    } catch (e) {
      push('error', e instanceof ApiError ? e.detail : 'Could not cancel that booking.')
    } finally {
      setCancelling(null)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b border-border bg-surface px-6 py-4">
        <div className="font-display text-lg font-semibold tracking-tight text-ink">My bookings</div>
        <div className="mt-0.5 text-[12.5px] text-ink-3">
          Rooms you've reserved · cancel frees the slot instantly
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[760px] px-6 pb-10 pt-6">
          {loading && (
            <div className="grid place-items-center py-20 text-accent">
              <Spinner className="h-6 w-6" />
            </div>
          )}
          {!loading && error && (
            <div className="py-16 text-center">
              <p className="text-sm text-danger-ink">{error}</p>
              <button onClick={load} className="mt-3 text-sm font-semibold text-accent">
                Retry
              </button>
            </div>
          )}
          {!loading && !error && data && (
            <>
              <SectionHeading label="Upcoming" count={data.upcoming.length} />
              {data.upcoming.length === 0 ? (
                <EmptyBlock>No upcoming bookings. Find a room to get started.</EmptyBlock>
              ) : (
                data.upcoming.map((b) => (
                  <BookingCard
                    key={b.id}
                    booking={b}
                    onCancel={() => cancel(b)}
                    cancelling={cancelling === b.id}
                  />
                ))
              )}

              <SectionHeading label="Past" count={data.past.length} />
              {data.past.length === 0 ? (
                <EmptyBlock>Nothing here yet.</EmptyBlock>
              ) : (
                data.past.map((b) => <BookingCard key={b.id} booking={b} past />)
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SectionHeading({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="mb-3 mt-6 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wide text-ink-3 first:mt-0">
      {label} · {count}
    </h3>
  )
}

function EmptyBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong px-6 py-7 text-center text-[13px] text-ink-3">
      {children}
    </div>
  )
}

interface CardProps {
  booking: Booking
  past?: boolean
  onCancel?: () => void
  cancelling?: boolean
}

function BookingCard({ booking: b, past, onCancel, cancelling }: CardProps) {
  return (
    <div
      className={`mb-2.5 flex items-center gap-4 rounded-[14px] border border-border bg-surface px-[18px] py-3.5 transition-shadow hover:shadow ${
        past ? 'opacity-60' : ''
      }`}
    >
      <div className="w-[88px] shrink-0 border-r border-border pr-4 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          {fmtDate(b.start, TZ)}
        </div>
        <div className="tnum mt-0.5 text-[15px] font-bold tracking-tight text-ink">
          {fmtTime(b.start, TZ)}
        </div>
      </div>
      <div className="flex-1">
        <div className="text-[14.5px] font-semibold text-ink">{b.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-[12.5px] text-ink-3">
          <span className="flex items-center gap-1 font-medium text-ink-2">
            <MapPin className="h-3.5 w-3.5" /> {b.location.room} · {b.location.floor}
          </span>
          <span className="tnum flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" /> {fmtTime(b.start, TZ)}–{fmtTime(b.end, TZ)}
          </span>
          {b.attendee_count != null && <span>{b.attendee_count} people</span>}
        </div>
      </div>
      {past ? (
        <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-ink-3">
          Completed
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-success-tint px-2.5 py-1 text-[11px] font-semibold text-success-ink">
            <Check className="h-3 w-3" /> Confirmed
          </span>
          <button
            onClick={onCancel}
            disabled={cancelling}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-3 transition-colors hover:bg-danger-tint hover:text-danger-ink disabled:opacity-50"
          >
            {cancelling ? <Spinner className="h-3.5 w-3.5" /> : 'Cancel'}
          </button>
        </div>
      )}
    </div>
  )
}
