import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { adminApi, type AdminUser, type CreateUserBody, type UpdateUserBody } from '@/api/admin'
import { ApiError } from '@/api'
import type { Role } from '@/api'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { Card, Field, FieldError, PageHeader, StatusPill } from './ui'

export function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminUser | 'new' | null>(null)
  const { push } = useToast()

  const load = useCallback(async () => {
    setError(null)
    try {
      setUsers(await adminApi.listUsers())
    } catch (e) {
      setError(e instanceof ApiError ? e.detail : 'Could not load users.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Local accounts and their roles. Deactivate to revoke access without losing history."
        action={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> New user
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

      {!users && !error && (
        <div className="grid place-items-center py-20 text-accent">
          <Spinner className="h-6 w-6" />
        </div>
      )}

      {users && (
        <Card className="divide-y divide-border">
          <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span></span>
          </div>
          {users.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold text-ink">
                  {u.display_name}
                </div>
                <div className="truncate text-[12.5px] text-ink-3">
                  @{u.username}
                  {u.email ? ` · ${u.email}` : ''}
                </div>
              </div>
              <span className="text-[12.5px] font-medium text-ink-2">
                {u.role === 'ADMIN' ? 'Admin' : 'Employee'}
              </span>
              <StatusPill active={u.is_active} />
              <button
                onClick={() => setEditing(u)}
                className="rounded-md p-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink-2"
                aria-label={`Edit ${u.display_name}`}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
          {users.length === 0 && (
            <div className="px-4 py-8 text-center text-[13px] text-ink-3">No users yet.</div>
          )}
        </Card>
      )}

      {editing && (
        <UserModal
          user={editing === 'new' ? null : editing}
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

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser | null
  onClose: () => void
  onSaved: (msg: string) => void
}) {
  const isNew = user === null
  const [username, setUsername] = useState(user?.username ?? '')
  const [displayName, setDisplayName] = useState(user?.display_name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'EMPLOYEE')
  const [isActive, setIsActive] = useState(user?.is_active ?? true)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      if (isNew) {
        const body: CreateUserBody = {
          username: username.trim(),
          displayName: displayName.trim(),
          role,
          password,
          ...(email.trim() ? { email: email.trim() } : {}),
        }
        await adminApi.createUser(body)
        onSaved(`Created ${displayName.trim()}`)
      } else {
        const body: UpdateUserBody = {
          displayName: displayName.trim(),
          email: email.trim() ? email.trim() : null,
          role,
          isActive,
          ...(password ? { password } : {}),
        }
        await adminApi.updateUser(user.id, body)
        onSaved(`Updated ${displayName.trim()}`)
      }
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.detail : 'Could not save. Check the fields and retry.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isNew ? 'New user' : `Edit ${user.display_name}`}
      description={isNew ? undefined : `@${user.username}`}
    >
      <form onSubmit={submit}>
        {isNew && (
          <Field label="Username">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="jdoe"
              autoFocus
              required
            />
          </Field>
        )}
        <Field label="Display name">
          <Input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
        </Field>
        <Field label="Email (optional)">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@acme.com"
          />
        </Field>
        <Field label="Role">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-10 w-full rounded border border-border-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <option value="EMPLOYEE">Employee</option>
            <option value="ADMIN">Admin</option>
          </select>
        </Field>
        <Field label={isNew ? 'Password' : 'Reset password (leave blank to keep)'}>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            required={isNew}
          />
        </Field>
        {!isNew && (
          <label className="mb-3.5 flex items-center gap-2 text-[13px] text-ink-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 accent-[var(--accent,#4f46e5)]"
            />
            Active (can log in)
          </label>
        )}
        <FieldError>{err}</FieldError>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? <Spinner className="h-4 w-4" /> : isNew ? 'Create user' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
