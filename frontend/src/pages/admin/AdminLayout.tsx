import { NavLink, Navigate, Outlet } from 'react-router-dom'
import { Users, Building2, Sparkles, CalendarClock } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'

const SUBTABS = [
  { to: '/admin/bookings', label: 'Bookings', icon: CalendarClock },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/locations', label: 'Rooms & Locations', icon: Building2 },
  { to: '/admin/facilities', label: 'Must-haves', icon: Sparkles },
]

export function AdminLayout() {
  const { user } = useAuth()
  // Client-side convenience gate; the API enforces ADMIN on every route (NF2).
  if (user && user.role !== 'ADMIN') return <Navigate to="/" replace />

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="border-b border-border bg-surface px-6 pt-4">
        <div className="font-display text-lg font-semibold tracking-tight text-ink">Admin</div>
        <div className="mt-0.5 text-[12.5px] text-ink-3">
          Manage the masters that power booking — users, locations, and room facilities
        </div>
        <nav className="mt-3 flex gap-1" aria-label="Admin sections">
          {SUBTABS.map((t) => {
            const Icon = t.icon
            return (
              <NavLink
                key={t.to}
                to={t.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                    isActive
                      ? 'border-accent text-accent'
                      : 'border-transparent text-ink-3 hover:text-ink-2',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </NavLink>
            )
          })}
        </nav>
      </div>
      <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[900px] px-6 pb-12 pt-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
