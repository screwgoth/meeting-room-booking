import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { adminApi, type AdminFacility } from '@/api/admin'
import { ApiError } from '@/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { facilityIcon } from '@/lib/facilityIcon'
import { Card, Field, FieldError, PageHeader, StatusPill } from './ui'

export function AdminFacilitiesPage() {
  const [items, setItems] = useState<AdminFacility[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminFacility | 'new' | null>(null)
  const { push } = useToast()

  const load = useCallback(async () => {
    setError(null)
    try {
      setItems(await adminApi.listFacilities())
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not load must-haves.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <PageHeader
        title="Must-haves"
        subtitle="The managed facility tags rooms are equipped with and employees filter by."
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New must-have
          </Button>
        }
      />

      {error && (
        <p className="mb-3 text-sm text-danger-ink">
          {error}{' '}
          <button onClick={load} className="font-semibold text-accent">
            Retry
          </button>
        </p>
      )}

      {!items && !error && (
        <div className="grid place-items-center py-20 text-accent">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {items && (
        <Card className="divide-y divide-border">
          {items.map((f) => {
            const Icon = facilityIcon(f.name)
            return (
            <div key={f.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-2">
                <Icon className="h-4 w-4" />
              </span>
              <span className="flex-1 text-[14px] font-medium text-ink">{f.name}</span>
              <StatusPill active={f.is_active} />
              <button
                onClick={() => setEditing(f)}
                className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
                aria-label={`Edit ${f.name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            )
          })}
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-ink-3">
              No must-haves yet. Add the first one.
            </div>
          )}
        </Card>
      )}

      {editing && (
        <FacilityModal
          facility={editing === 'new' ? null : editing}
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

function FacilityModal({
  facility,
  onClose,
  onSaved,
}: {
  facility: AdminFacility | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isNew = facility === null
  const [name, setName] = useState(facility?.name ?? '')
  const [isActive, setIsActive] = useState(facility?.is_active ?? true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      if (isNew) {
        await adminApi.createFacility(name.trim())
        onSaved(`Added “${name.trim()}”`)
      } else {
        await adminApi.updateFacility(facility.id, { name: name.trim(), isActive })
        onSaved(`Updated “${name.trim()}”`)
      }
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.detail : 'Could not save. A name may already exist.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'New must-have' : `Edit ${facility.name}`}
    >
      <form onSubmit={submit}>
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Projector"
            autoFocus
            required
          />
        </Field>
        {!isNew && (
          <label className="mb-3.5 flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            Active (available for rooms & filters)
          </label>
        )}
        <FieldError>{err}</FieldError>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : isNew ? 'Add' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
