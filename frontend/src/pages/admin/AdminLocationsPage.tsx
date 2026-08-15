import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, ChevronRight } from 'lucide-react'
import {
  adminApi,
  type AdminOffice,
  type AdminFloor,
  type AdminRoom,
  type AdminFacility,
} from '@/api/admin'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/utils'
import { Field, FieldError, PageHeader, StatusPill } from './ui'

type NameEdit = { kind: 'office' | 'floor'; row: AdminOffice | AdminFloor | null } | null

export function AdminLocationsPage() {
  const { push } = useToast()
  const [offices, setOffices] = useState<AdminOffice[]>([])
  const [floors, setFloors] = useState<AdminFloor[]>([])
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [facilities, setFacilities] = useState<AdminFacility[]>([])
  const [officeId, setOfficeId] = useState<number | null>(null)
  const [floorId, setFloorId] = useState<number | null>(null)
  const [loadingOffices, setLoadingOffices] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [nameEdit, setNameEdit] = useState<NameEdit>(null)
  const [roomEdit, setRoomEdit] = useState<AdminRoom | 'new' | null>(null)

  const fail = (e: unknown, fallback: string) =>
    setError(e instanceof ApiError ? e.detail : fallback)

  const loadOffices = useCallback(async () => {
    setLoadingOffices(true)
    try {
      const list = await adminApi.listOffices()
      setOffices(list)
    } catch (e) {
      fail(e, 'Could not load offices.')
    } finally {
      setLoadingOffices(false)
    }
  }, [])

  const loadFloors = useCallback(async (oid: number) => {
    try {
      setFloors(await adminApi.listFloors(oid))
    } catch (e) {
      fail(e, 'Could not load floors.')
    }
  }, [])

  const loadRooms = useCallback(async (fid: number) => {
    try {
      setRooms(await adminApi.listRooms(fid))
    } catch (e) {
      fail(e, 'Could not load rooms.')
    }
  }, [])

  useEffect(() => {
    void loadOffices()
    adminApi.listFacilities().then(setFacilities).catch(() => {})
  }, [loadOffices])

  useEffect(() => {
    setFloors([])
    setFloorId(null)
    setRooms([])
    if (officeId != null) void loadFloors(officeId)
  }, [officeId, loadFloors])

  useEffect(() => {
    setRooms([])
    if (floorId != null) void loadRooms(floorId)
  }, [floorId, loadRooms])

  return (
    <>
      <PageHeader
        title="Rooms & Locations"
        subtitle="Org → Office → Floor → Room. Deactivate keeps history; you can't hard-delete a non-empty node."
      />

      {error && (
        <p className="mb-3 text-sm text-danger-ink">
          {error}{' '}
          <button
            onClick={() => {
              setError(null)
              void loadOffices()
            }}
            className="font-semibold text-accent"
          >
            Dismiss
          </button>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Offices column */}
        <Column
          title="Offices"
          onAdd={() => setNameEdit({ kind: 'office', row: null })}
          loading={loadingOffices}
        >
          {offices.map((o) => (
            <ListRow
              key={o.id}
              label={o.name}
              active={o.is_active}
              selected={officeId === o.id}
              onSelect={() => setOfficeId(o.id)}
              onEdit={() => setNameEdit({ kind: 'office', row: o })}
              chevron
            />
          ))}
          {offices.length === 0 && !loadingOffices && <Empty>No offices.</Empty>}
        </Column>

        {/* Floors column */}
        <Column
          title="Floors"
          disabled={officeId == null}
          onAdd={officeId != null ? () => setNameEdit({ kind: 'floor', row: null }) : undefined}
        >
          {officeId == null ? (
            <Empty>Select an office.</Empty>
          ) : (
            <>
              {floors.map((f) => (
                <ListRow
                  key={f.id}
                  label={f.name}
                  active={f.is_active}
                  selected={floorId === f.id}
                  onSelect={() => setFloorId(f.id)}
                  onEdit={() => setNameEdit({ kind: 'floor', row: f })}
                  chevron
                />
              ))}
              {floors.length === 0 && <Empty>No floors.</Empty>}
            </>
          )}
        </Column>

        {/* Rooms column */}
        <Column
          title="Rooms"
          disabled={floorId == null}
          onAdd={floorId != null ? () => setRoomEdit('new') : undefined}
        >
          {floorId == null ? (
            <Empty>Select a floor.</Empty>
          ) : (
            <>
              {rooms.map((r) => (
                <ListRow
                  key={r.id}
                  label={r.name}
                  sub={`${r.capacity} seats`}
                  active={r.is_active}
                  onEdit={() => setRoomEdit(r)}
                />
              ))}
              {rooms.length === 0 && <Empty>No rooms.</Empty>}
            </>
          )}
        </Column>
      </div>

      {nameEdit && (
        <NameModal
          kind={nameEdit.kind}
          row={nameEdit.row}
          onClose={() => setNameEdit(null)}
          onSaved={async (msg) => {
            setNameEdit(null)
            push('success', msg)
            if (nameEdit.kind === 'office') await loadOffices()
            else if (officeId != null) await loadFloors(officeId)
          }}
          officeId={officeId}
        />
      )}

      {roomEdit && floorId != null && (
        <RoomModal
          room={roomEdit === 'new' ? null : roomEdit}
          floorId={floorId}
          facilities={facilities}
          onClose={() => setRoomEdit(null)}
          onSaved={async (msg) => {
            setRoomEdit(null)
            push('success', msg)
            await loadRooms(floorId)
          }}
        />
      )}
    </>
  )
}

// ---- Layout primitives -----------------------------------------------------

function Column({
  title,
  children,
  onAdd,
  disabled,
  loading,
}: {
  title: string
  children: React.ReactNode
  onAdd?: () => void
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          {title}
        </span>
        {onAdd && (
          <button
            onClick={onAdd}
            disabled={disabled}
            className="rounded-md p-1 text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent disabled:opacity-40"
            aria-label={`Add ${title}`}
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="max-h-[52vh] divide-y divide-border overflow-auto">
        {loading ? (
          <div className="grid place-items-center py-10 text-accent">
            <Spinner className="h-5 w-5" />
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function ListRow({
  label,
  sub,
  active,
  selected,
  onSelect,
  onEdit,
  chevron,
}: {
  label: string
  sub?: string
  active: boolean
  selected?: boolean
  onSelect?: () => void
  onEdit: () => void
  chevron?: boolean
}) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 px-3 py-2.5 transition-colors',
        onSelect && 'cursor-pointer hover:bg-surface-2',
        selected && 'bg-accent/10',
      )}
      onClick={onSelect}
    >
      <div className="min-w-0 flex-1">
        <div className={cn('truncate text-[13.5px] font-medium', active ? 'text-ink' : 'text-ink-3')}>
          {label}
        </div>
        {sub && <div className="text-[11.5px] text-ink-3">{sub}</div>}
      </div>
      {!active && <StatusPill active={false} />}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onEdit()
        }}
        className="rounded-md p-1 text-ink-3 opacity-0 transition hover:bg-surface hover:text-ink-2 group-hover:opacity-100"
        aria-label={`Edit ${label}`}
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      {chevron && <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-8 text-center text-[12.5px] text-ink-3">{children}</div>
}

// ---- Office / Floor name modal --------------------------------------------

function NameModal({
  kind,
  row,
  officeId,
  onClose,
  onSaved,
}: {
  kind: 'office' | 'floor'
  row: AdminOffice | AdminFloor | null
  officeId: number | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isNew = row === null
  const label = kind === 'office' ? 'Office' : 'Floor'
  const [name, setName] = useState(row?.name ?? '')
  const [isActive, setIsActive] = useState(row?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const trimmed = name.trim()
      if (kind === 'office') {
        if (isNew) await adminApi.createOffice(trimmed)
        else await adminApi.updateOffice(row!.id, { name: trimmed, isActive })
      } else {
        if (isNew) await adminApi.createFloor(officeId!, trimmed)
        else await adminApi.updateFloor(row!.id, { name: trimmed, isActive })
      }
      onSaved(`${isNew ? 'Added' : 'Updated'} ${label.toLowerCase()} “${trimmed}”`)
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.detail : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={isNew ? `New ${label.toLowerCase()}` : `Edit ${label.toLowerCase()}`}>
      <form onSubmit={submit}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        {!isNew && (
          <label className="mb-3.5 flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            Active
          </label>
        )}
        <FieldError>{err}</FieldError>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ---- Room modal ------------------------------------------------------------

function RoomModal({
  room,
  floorId,
  facilities,
  onClose,
  onSaved,
}: {
  room: AdminRoom | null
  floorId: number
  facilities: AdminFacility[]
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isNew = room === null
  const [name, setName] = useState(room?.name ?? '')
  const [capacity, setCapacity] = useState(String(room?.capacity ?? 6))
  const [isActive, setIsActive] = useState(room?.is_active ?? true)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [ready, setReady] = useState(isNew)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (room) {
      adminApi
        .roomFacilities(room.id)
        .then((r) => setSelected(new Set(r.facilityIds)))
        .catch(() => {})
        .finally(() => setReady(true))
    }
  }, [room])

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const cap = Number(capacity)
      const facilityIds = [...selected]
      if (isNew) {
        await adminApi.createRoom({ floorId, name: name.trim(), capacity: cap, facilityIds })
      } else {
        await adminApi.updateRoom(room!.id, {
          name: name.trim(),
          capacity: cap,
          isActive,
          facilityIds,
        })
      }
      onSaved(`${isNew ? 'Added' : 'Updated'} room “${name.trim()}”`)
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.detail : 'Could not save the room.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={isNew ? 'New room' : `Edit ${room.name}`}>
      <form onSubmit={submit}>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </Field>
        <Field label="Capacity (seats)">
          <Input
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            required
          />
        </Field>
        <div className="mb-3.5">
          <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">Must-haves</span>
          {!ready ? (
            <Spinner className="h-4 w-4 text-accent" />
          ) : facilities.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">No must-haves defined yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {facilities
                .filter((f) => f.is_active || selected.has(f.id))
                .map((f) => {
                  const on = selected.has(f.id)
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggle(f.id)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors',
                        on
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border-strong text-ink-2 hover:bg-surface-2',
                      )}
                    >
                      {f.name}
                    </button>
                  )
                })}
            </div>
          )}
        </div>
        {!isNew && (
          <label className="mb-3.5 flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            Active (bookable)
          </label>
        )}
        <FieldError>{err}</FieldError>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
