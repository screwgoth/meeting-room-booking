import { Check, Plus, Search, Users } from 'lucide-react'
import type { AvailabilityRoom } from '@/api'
import { cn } from '@/lib/utils'
import { facilityIcon } from '@/lib/facilityIcon'
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  fmtTime,
  instantPct,
  pctFromGridMinutes,
  slotLabel,
} from '@/lib/time'
import { fromHM, type Filters } from './filters'
import { groupRooms } from './grouping'

interface Props {
  rooms: AvailabilityRoom[]
  filters: Filters
  tz: string
  /** True when the filtered window has already passed (no booking target). */
  windowPast: boolean
  animate: boolean
  onBook: (room: AvailabilityRoom) => void
  onReset: () => void
}

function bandBounds(filters: Filters) {
  const startMin = fromHM(filters.start) - GRID_START_HOUR * 60
  const endMin = fromHM(filters.end) - GRID_START_HOUR * 60
  const left = pctFromGridMinutes(startMin)
  const width = pctFromGridMinutes(endMin) - left
  return { left, width }
}

/** The rooms×time timeline (design thesis: availability is a glance). Time axis on
 * top, three sections below (fits&free / fits-busy / non-match). Free = quiet
 * negative space; the accent band is the filtered window drawn across every row. */
export function TimelineGrid({ rooms, filters, tz, windowPast, animate, onBook, onReset }: Props) {
  const { fitsFree, fitsBusy, nonFit } = groupRooms(rooms)
  const band = bandBounds(filters)
  const windowLabel = `${filters.start}–${filters.end}`

  const ticks: number[] = []
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h += 2) ticks.push(h)

  if (fitsFree.length === 0 && fitsBusy.length === 0) {
    return (
      <EmptyState onReset={onReset} />
    )
  }

  const row = (r: AvailabilityRoom, mode: 'fits' | 'busywin' | 'dim', i: number) => (
    <RoomRow
      key={r.id}
      room={r}
      mode={mode}
      band={band}
      windowLabel={windowLabel}
      tz={tz}
      windowPast={windowPast}
      onBook={onBook}
      style={animate ? { animationDelay: `${i * 32}ms` } : undefined}
      animate={animate}
    />
  )

  let idx = 0
  return (
    <div className="min-w-[760px] px-6 pb-10 pt-5">
      {/* Legend */}
      <div className="mb-3.5 flex flex-wrap items-center gap-4 text-xs text-ink-2">
        <Key className="border-accent-band-edge bg-accent-band" label="Your window" />
        <Key className="border-border-strong bg-surface" label="Free — click to book" />
        <Key className="border-busy-edge bg-busy" label="Taken" />
        <Key className="border-mine-edge bg-mine" label="Your booking" />
      </div>

      {/* Time axis */}
      <div className="sticky top-0 z-[6] mb-0.5 flex bg-bg pb-1.5">
        <div className="w-[232px] shrink-0" />
        <div className="relative h-[22px] flex-1">
          {ticks.map((h) => (
            <span
              key={h}
              className={cn(
                'tnum absolute top-0 text-[11px] font-medium text-ink-3',
                h === GRID_START_HOUR ? '' : h === GRID_END_HOUR ? '' : '-translate-x-1/2',
              )}
              style={
                h === GRID_END_HOUR
                  ? { right: 0 }
                  : { left: `${pctFromGridMinutes((h - GRID_START_HOUR) * 60)}%` }
              }
            >
              {slotLabel((h - GRID_START_HOUR) * (60 / 15))}
            </span>
          ))}
        </div>
      </div>

      {/* Fits & free */}
      <SectionLabel accent count={fitsFree.length} label="Fits & free in your window" />
      {fitsFree.length === 0 && (
        <div className="mb-2 rounded-[10px] border border-dashed border-border-strong bg-surface-2 px-4 py-3.5 text-[13px] text-ink-3">
          Every fitting room is taken in this window. Try a different time, or see fitting-but-busy rooms below.
        </div>
      )}
      {fitsFree.map((r) => row(r, 'fits', idx++))}

      {fitsBusy.length > 0 && (
        <>
          <SectionLabel count={fitsBusy.length} label="Fits, but taken in your window" />
          {fitsBusy.map((r) => row(r, 'busywin', idx++))}
        </>
      )}

      {nonFit.length > 0 && (
        <>
          <SectionLabel count={nonFit.length} label="Doesn't match your filter" />
          {nonFit.map((r) => row(r, 'dim', idx++))}
        </>
      )}
    </div>
  )
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cn('h-3 w-[22px] rounded border', className)} />
      {label}
    </span>
  )
}

function SectionLabel({ accent, count, label }: { accent?: boolean; count: number; label: string }) {
  return (
    <div
      className={cn(
        'my-2.5 mt-4 flex items-center gap-2.5 text-xs font-semibold uppercase tracking-wide',
        accent ? 'text-accent' : 'text-ink-3',
      )}
    >
      <span className={accent ? 'bg-grad-lime bg-clip-text font-bold text-transparent' : ''}>
        {label} · {count}
      </span>
      <span className={cn('h-px flex-1', accent ? 'bg-gradient-to-r from-accent-band-edge to-transparent' : 'bg-border')} />
    </div>
  )
}

interface RowProps {
  room: AvailabilityRoom
  mode: 'fits' | 'busywin' | 'dim'
  band: { left: number; width: number }
  windowLabel: string
  tz: string
  windowPast: boolean
  animate: boolean
  onBook: (room: AvailabilityRoom) => void
  style?: React.CSSProperties
}

function RoomRow({ room, mode, band, windowLabel, tz, windowPast, animate, onBook, style }: RowProps) {
  const fits = mode === 'fits'
  const dim = mode === 'dim'
  const canBook = fits && !windowPast

  return (
    <div
      style={style}
      className={cn(
        'mb-2 flex items-stretch overflow-hidden rounded-[10px] border bg-surface transition-[box-shadow,border-color]',
        fits ? 'border-mine-edge hover:border-accent hover:shadow' : 'border-border',
        dim && 'opacity-60',
        animate && 'motion-safe:animate-[row-rise_.36s_cubic-bezier(.2,.85,.25,1)_both]',
      )}
    >
      {/* Meta */}
      <div className="flex w-[232px] shrink-0 flex-col gap-1.5 border-r border-border bg-surface px-3.5 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-ink">
          {room.name}
          {fits && (
            <span className="rounded-[5px] bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-accent">
              FITS
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5 text-xs text-ink-3">
          <span className="flex items-center gap-1 font-medium text-ink-2">
            <Users className="h-3.5 w-3.5" />
            {room.capacity}
          </span>
          <span>·</span>
          <span>{room.floor.name}</span>
        </div>
        <div className="flex gap-1.5 text-ink-3">
          {room.facilities.map((f) => {
            const Icon = facilityIcon(f.name)
            return <Icon key={f.id} className="h-[15px] w-[15px] text-ink-2" aria-label={f.name} />
          })}
        </div>
      </div>

      {/* Track */}
      <div
        className={cn(
          'relative min-h-[64px] flex-1 bg-surface',
          '[background-image:linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:calc(100%/12)_100%]',
          dim &&
            '[background-image:repeating-linear-gradient(135deg,transparent,transparent_7px,rgba(13,43,48,.03)_7px,rgba(13,43,48,.03)_8px)]',
        )}
      >
        {/* Window band (static); shimmer sweep rides an inner overlay on filter change */}
        <div
          className="pointer-events-none absolute inset-y-0 z-[1] overflow-hidden border-x-[1.5px] border-dashed border-accent-band-edge bg-accent-band"
          style={{ left: `${band.left}%`, width: `${band.width}%` }}
        >
          {animate && (
            <span className="absolute inset-0 bg-[linear-gradient(100deg,transparent_30%,rgba(25,134,148,.22)_50%,transparent_70%)] motion-safe:animate-[band-sweep_.7s_cubic-bezier(.3,.7,.3,1)_both]" />
          )}
        </div>

        {/* Busy blocks */}
        {room.bookings
          .filter((b) => !b.is_mine)
          .map((b) => {
            const left = instantPct(b.start, tz)
            const width = instantPct(b.end, tz) - left
            return (
              <div
                key={b.id}
                className="absolute inset-y-2 z-[2] flex flex-col justify-center overflow-hidden rounded-[7px] border border-busy-edge bg-busy px-2.5 text-[11.5px] leading-tight text-busy-ink"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${b.title} · ${fmtTime(b.start, tz)}–${fmtTime(b.end, tz)}`}
              >
                <span className="truncate font-semibold text-ink-2">{b.title}</span>
                <span className="tnum">
                  {fmtTime(b.start, tz)}–{fmtTime(b.end, tz)}
                </span>
              </div>
            )
          })}

        {/* Mine blocks */}
        {room.bookings
          .filter((b) => b.is_mine)
          .map((b) => {
            const left = instantPct(b.start, tz)
            const width = instantPct(b.end, tz) - left
            return (
              <div
                key={b.id}
                className="absolute inset-y-2 z-[2] flex flex-col justify-center overflow-hidden rounded-[7px] border border-mine-edge bg-mine px-2.5 text-[11.5px] leading-tight text-accent-press shadow-sm"
                style={{ left: `${left}%`, width: `${width}%` }}
                title={`${b.title} · ${fmtTime(b.start, tz)}–${fmtTime(b.end, tz)}`}
              >
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-accent">
                  <Check className="h-2.5 w-2.5" /> Yours
                </span>
                <span className="truncate font-bold">{b.title}</span>
              </div>
            )
          })}

        {/* Free slot — the book target, only when the room fits & is free */}
        {canBook && (
          <button
            onClick={() => onBook(room)}
            aria-label={`Book ${room.name} ${windowLabel}`}
            className="group absolute inset-y-1.5 z-[3] grid place-items-center rounded-lg border-[1.5px] border-dashed border-accent/25 transition-[background,border-color,box-shadow] hover:border-accent hover:bg-accent/10 hover:shadow-[inset_0_0_0_1px_rgba(25,134,148,.18)] motion-safe:animate-[slot-breathe_3.2s_ease-in-out_infinite] motion-safe:hover:animate-none"
            style={{ left: `${band.left}%`, width: `${band.width}%` }}
          >
            <span className="pointer-events-none inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-accent opacity-0 shadow transition-opacity group-hover:opacity-100">
              <Plus className="h-3.5 w-3.5" /> Book {windowLabel}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="mx-auto max-w-[420px] px-5 py-16 text-center text-ink-3">
      <Search className="mx-auto mb-3.5 h-12 w-12 text-border-strong" />
      <h3 className="mb-1.5 text-[15px] font-semibold text-ink">No room matches all of that</h3>
      <p className="text-[13px] leading-relaxed">
        Nothing here fits your seats and facilities free in that window. Loosen a facility or widen the time.
      </p>
      <button onClick={onReset} className="mt-3.5 font-semibold text-accent">
        Reset filters
      </button>
    </div>
  )
}
