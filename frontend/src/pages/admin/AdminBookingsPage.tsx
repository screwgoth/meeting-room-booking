import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, X, MapPin, Clock, User as UserIcon } from 'lucide-react'
import {
  adminApi,
  type AdminBooking,
  type AdminUser,
  type AdminOffice,
  type AdminFloor,
  type AdminRoom,
} from '@/api/admin'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { fmtDate, fmtTime, dateInTz, zonedWallToUtc, GRID_START_HOUR, GRID_END_HOUR } from '@/lib/time'
import { Card, Field, FieldError, PageHeader } from './ui'

const TZ = 'Asia/Kolkata'

// 08:00 … 20:00 on the 15-min grid, as selectable "HH:MM" options.
const TIME_OPTIONS: string[] = (() => {
  const out: string[] = []
  for (let h = GRID_START_HOUR; h <= GRID_END_HOUR; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === GRID_END_HOUR && m > 0) break
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

export function AdminBookingsPage() {
  const [bookings, setBookings] = useState<AdminBooking[] | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminBooking | null>(null)
  const { push } = useToast()

  const load = useCallback(async () => {
    setError(null)
    try {
      const [b, u] = await Promise.all([adminApi.listBookings(), adminApi.listUsers()])
      setBookings(b)
      setUsers(u.filter((x) => x.is_active))
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not load bookings.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function cancel(b: AdminBooking) {
    const reason = window.prompt(`Cancel “${b.title}” (${b.owner.display_name})?\nOptional reason:`)
    if (reason === null) return // dialog dismissed
    try {
      await adminApi.cancelBooking(b.id, reason || undefined)
      push('success', `Cancelled “${b.title}” · ${b.location.room} freed`)
      void load()
    } catch (e) {
      push('error', e instanceof ApiError ? e.detail : 'Could not cancel.')
    }
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        subtitle="Every upcoming reservation across the org. Edit, reassign the owner, or cancel on anyone's behalf."
      />

      {error && (
        <p className="mb-3 text-sm text-danger-ink">
          {error}{' '}
          <button onClick={load} className="font-semibold text-accent">
            Retry
          </button>
        </p>
      )}

      {!bookings && !error && (
        <div className="grid place-items-center py-20 text-accent">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {bookings && (
        <Card className="divide-y divide-border">
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center gap-4 px-4 py-3">
              <div className="w-[86px] shrink-0 border-r border-border pr-4 text-center">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                  {fmtDate(b.start, TZ)}
                </div>
                <div className="tnum mt-0.5 text-[14px] font-bold tracking-tight text-ink">
                  {fmtTime(b.start, TZ)}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-ink">{b.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[12.5px] text-ink-3">
                  <span className="flex items-center gap-1 font-medium text-ink-2">
                    <MapPin className="h-3.5 w-3.5" /> {b.location.room} · {b.location.floor} ·{' '}
                    {b.location.office}
                  </span>
                  <span className="tnum flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {fmtTime(b.start, TZ)}–{fmtTime(b.end, TZ)}
                  </span>
                  <span className="flex items-center gap-1">
                    <UserIcon className="h-3.5 w-3.5" /> {b.owner.display_name}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setEditing(b)}
                className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
                aria-label={`Edit ${b.title}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => cancel(b)}
                className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-danger-tint hover:text-danger-ink"
                aria-label={`Cancel ${b.title}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {bookings.length === 0 && (
            <div className="px-4 py-10 text-center text-[13px] text-ink-3">
              No upcoming bookings.
            </div>
          )}
        </Card>
      )}

      {editing && (
        <EditBookingModal
          booking={editing}
          users={users}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null)
            push('success', msg)
            void load()
          }}
        />
      )}
    </>
  )
}

function EditBookingModal({
  booking,
  users,
  onClose,
  onSaved,
}: {
  booking: AdminBooking
  users: AdminUser[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const [title, setTitle] = useState(booking.title)
  const [attendees, setAttendees] = useState(
    booking.attendee_count != null ? String(booking.attendee_count) : '',
  )
  const [date, setDate] = useState(dateInTz(booking.start, TZ))
  const [start, setStart] = useState(fmtTime(booking.start, TZ))
  const [end, setEnd] = useState(fmtTime(booking.end, TZ))
  const [ownerId, setOwnerId] = useState(booking.owner.id)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // Optional room move (defaults to keeping the current room).
  const [changeRoom, setChangeRoom] = useState(false)
  const [offices, setOffices] = useState<AdminOffice[]>([])
  const [floors, setFloors] = useState<AdminFloor[]>([])
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [officeId, setOfficeId] = useState<number | ''>('')
  const [floorId, setFloorId] = useState<number | ''>('')
  const [roomId, setRoomId] = useState<number>(booking.room_id)

  useEffect(() => {
    if (changeRoom && offices.length === 0) {
      adminApi.listOffices().then((o) => setOffices(o.filter((x) => x.is_active))).catch(() => {})
    }
  }, [changeRoom, offices.length])
  useEffect(() => {
    if (officeId === '') return
    adminApi.listFloors(officeId).then((f) => setFloors(f.filter((x) => x.is_active))).catch(() => {})
    setFloorId('')
    setRooms([])
  }, [officeId])
  useEffect(() => {
    if (floorId === '') return
    adminApi.listRooms(floorId).then((r) => setRooms(r.filter((x) => x.is_active))).catch(() => {})
  }, [floorId])

  const ownerChanged = ownerId !== booking.owner.id

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setErr(null)
    if (start >= end) {
      setErr('End time must be after the start time.')
      return
    }
    setSaving(true)
    try {
      const [sh, sm] = start.split(':').map(Number)
      const [eh, em] = end.split(':').map(Number)
      const startISO = zonedWallToUtc(date, sh, sm, TZ).toISOString()
      const endISO = zonedWallToUtc(date, eh, em, TZ).toISOString()
      await adminApi.updateBooking(booking.id, {
        room_id: changeRoom ? roomId : booking.room_id,
        start: startISO,
        end: endISO,
        title: title.trim(),
        attendee_count: attendees ? Number(attendees) : null,
        ...(ownerChanged ? { owner_user_id: ownerId } : {}),
      })
      onSaved(`Updated “${title.trim()}”`)
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.detail : 'Could not save. Check the slot is free.')
    } finally {
      setSaving(false)
    }
  }

  const ownerOptions = useMemo(
    () =>
      [...users].sort((a, b) => a.display_name.localeCompare(b.display_name)),
    [users],
  )

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit booking"
      description={`${booking.location.room} · currently ${booking.owner.display_name}`}
    >
      <form onSubmit={submit}>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label="Start">
            <TimeSelect value={start} onChange={setStart} />
          </Field>
          <Field label="End">
            <TimeSelect value={end} onChange={setEnd} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Attendees (optional)">
            <Input
              type="number"
              min={1}
              value={attendees}
              onChange={(e) => setAttendees(e.target.value)}
            />
          </Field>
          <Field label="Owner">
            <select
              value={ownerId}
              onChange={(e) => setOwnerId(Number(e.target.value))}
              className="h-10 w-full rounded border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
              {ownerOptions.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name} (@{u.username})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="mb-2 flex items-center gap-2 text-[13px] text-ink-2">
          <input
            type="checkbox"
            checked={changeRoom}
            onChange={(e) => setChangeRoom(e.target.checked)}
            className="h-4 w-4"
          />
          Move to a different room (currently {booking.location.room})
        </label>
        {changeRoom && (
          <div className="mb-3.5 grid grid-cols-3 gap-3">
            <Select
              value={officeId}
              onChange={(v) => setOfficeId(v)}
              placeholder="Office"
              options={offices.map((o) => ({ id: o.id, label: o.name }))}
            />
            <Select
              value={floorId}
              onChange={(v) => setFloorId(v)}
              placeholder="Floor"
              options={floors.map((f) => ({ id: f.id, label: f.name }))}
            />
            <Select
              value={roomId}
              onChange={(v) => setRoomId(Number(v))}
              placeholder="Room"
              options={rooms.map((r) => ({ id: r.id, label: `${r.name} · ${r.capacity}p` }))}
            />
          </div>
        )}

        <FieldError>{err}</FieldError>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="tnum h-10 w-full rounded border border-border-strong bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  )
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: number | ''
  onChange: (v: number | '') => void
  placeholder: string
  options: { id: number; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className="h-10 w-full rounded border border-border-strong bg-surface px-2 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
