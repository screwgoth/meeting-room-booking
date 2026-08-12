import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, Users, X } from 'lucide-react'
import { api, ApiError } from '@/api'
import type { AvailabilityRoom, Booking, BookingWarning } from '@/api'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import { fromHM, toHM, type Filters } from './filters'
import { zonedWallToUtc } from '@/lib/time'

interface Props {
  room: AvailabilityRoom
  filters: Filters
  tz: string
  onClose: () => void
  onBooked: (booking: Booking) => void
}

type ConfirmState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string }
  | { kind: 'warn'; warnings: BookingWarning[] } // soft attendees>capacity, book-anyway

function durLabel(mins: number): string {
  if (mins % 60 === 0) return `${mins / 60} hr`
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} hr ${mins % 60} min`
}

/** Inline booking confirm — deliberately a popover, not a modal (in-context, not an
 * interruption). Re-validates server-side on confirm: a 409 renders the conflict as a
 * first-class panel state (the collision guard made visible), never a fleeting toast. */
export function BookingPopover({ room, filters, tz, onClose, onBooked }: Props) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(filters.start)
  const [end, setEnd] = useState(filters.end)
  const [attendees, setAttendees] = useState(String(filters.capacity))
  const [state, setState] = useState<ConfirmState>({ kind: 'idle' })
  const titleRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    titleRef.current?.focus()
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])

  const mins = fromHM(end) - fromHM(start)
  const att = attendees.trim() === '' ? null : Number(attendees)
  const overCapacity = att != null && Number.isFinite(att) && att > room.capacity

  async function submit() {
    if (mins <= 0) {
      setState({ kind: 'error', message: 'End time must be after start.' })
      return
    }
    // Soft, non-blocking capacity warning — confirm once, then proceed (§5a).
    if (overCapacity && state.kind !== 'warn') {
      setState({
        kind: 'warn',
        warnings: [
          {
            code: 'attendees_over_capacity',
            message: `Seats ${room.capacity}, you entered ${att}. Book anyway?`,
          },
        ],
      })
      return
    }

    setState({ kind: 'submitting' })
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    try {
      const res = await api.createBooking({
        room_id: room.id,
        start: zonedWallToUtc(filters.date, sh, sm, tz).toISOString(),
        end: zonedWallToUtc(filters.date, eh, em, tz).toISOString(),
        title: title.trim() || 'Meeting',
        attendee_count: att,
      })
      onBooked(res.booking)
    } catch (e) {
      if (e instanceof ApiError && e.isConflict) setState({ kind: 'conflict' })
      else if (e instanceof ApiError && e.isValidation)
        setState({ kind: 'error', message: e.detail })
      else setState({ kind: 'error', message: 'Something went wrong. Please try again.' })
    }
  }

  const submitting = state.kind === 'submitting'

  return (
    <>
      <div
        className="fixed inset-0 z-[80] bg-ink/12 backdrop-blur-[1.5px] motion-safe:transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Book ${room.name}`}
        className="fixed left-1/2 top-24 z-[90] w-[344px] max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[14px] border border-border bg-surface shadow-pop motion-safe:animate-[pop-in_.18s_cubic-bezier(.2,.8,.2,1)]"
      >
        {/* Head */}
        <div className="border-b border-border px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="font-display text-base font-semibold text-ink">{room.name}</div>
            <button onClick={onClose} aria-label="Close" className="text-ink-3 hover:text-ink-2">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-xs text-ink-3">
            <span className="flex items-center gap-1 font-medium text-ink-2">
              <Users className="h-3.5 w-3.5" /> {room.capacity} seats
            </span>
            <span>{room.floor.name}</span>
          </div>
        </div>

        {/* Status banner */}
        {state.kind === 'conflict' ? (
          <div
            role="alert"
            className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-danger-tint px-3 py-2.5 text-[12.5px] text-danger-ink"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <b className="block font-bold">Just taken by someone else.</b>
              Pick another free slot — we blocked the double-booking.
            </span>
          </div>
        ) : state.kind === 'error' ? (
          <div
            role="alert"
            className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-danger-tint px-3 py-2.5 text-[12.5px] text-danger-ink"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.message}</span>
          </div>
        ) : state.kind === 'warn' ? (
          <div
            role="alert"
            className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-warn-tint px-3 py-2.5 text-[12.5px] text-warn"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{state.warnings[0]?.message}</span>
          </div>
        ) : (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-success-tint px-3 py-2 text-[12.5px] font-semibold text-success-ink">
            <Check className="h-4 w-4" />
            <span>Available — no overlap. Held while you confirm.</span>
          </div>
        )}

        {/* Body */}
        <div className="px-4 pb-1 pt-3.5">
          <div className="mb-3">
            <label htmlFor="bk-title" className="mb-1.5 block text-xs font-semibold text-ink-2">
              Meeting title
            </label>
            <input
              id="bk-title"
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="e.g. Design review"
              autoComplete="off"
              className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2.5 text-sm text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
            />
          </div>
          <div className="flex gap-2.5">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs font-semibold text-ink-2">Time</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  step={900}
                  value={start}
                  aria-label="Start time"
                  onChange={(e) => {
                    const s = fromHM(e.target.value)
                    setStart(toHM(s))
                    if (fromHM(end) <= s) setEnd(toHM(s + 15))
                  }}
                  className="tnum w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-center font-semibold text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                />
                <span className="text-ink-3">–</span>
                <input
                  type="time"
                  step={900}
                  value={end}
                  aria-label="End time"
                  onChange={(e) => setEnd(e.target.value)}
                  className="tnum w-full rounded-lg border border-border-strong bg-surface px-2 py-2 text-center font-semibold text-ink focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                />
              </div>
            </div>
            <div className="w-[84px]">
              <label htmlFor="bk-att" className="mb-1.5 block text-xs font-semibold text-ink-2">
                Attendees
              </label>
              <input
                id="bk-att"
                inputMode="numeric"
                value={attendees}
                onChange={(e) => setAttendees(e.target.value.replace(/[^\d]/g, ''))}
                className={cn(
                  'tnum w-full rounded-lg border bg-surface px-2 py-2 text-center font-semibold text-ink focus-visible:outline-none focus-visible:ring-2',
                  overCapacity
                    ? 'border-warn focus-visible:ring-warn/30'
                    : 'border-border-strong focus-visible:border-accent focus-visible:ring-accent/30',
                )}
              />
            </div>
          </div>
        </div>

        {/* Foot */}
        <div className="flex items-center gap-2.5 px-4 pb-4 pt-3">
          <span className="mr-auto text-xs text-ink-3">
            Duration <b className="font-semibold text-ink">{durLabel(mins)}</b>
          </span>
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-ink-2 hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-grad-brand px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-sm transition-[filter,box-shadow] hover:brightness-105 disabled:opacity-60"
          >
            {submitting ? (
              <Spinner className="h-4 w-4" />
            ) : state.kind === 'warn' ? (
              'Book anyway'
            ) : state.kind === 'conflict' ? (
              'Retry'
            ) : (
              'Book'
            )}
          </button>
        </div>
      </div>
    </>
  )
}
