import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { CalendarClock, LogOut } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/', label: 'Availability', end: true },
  { to: '/my-bookings', label: 'My Bookings', end: false },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const tabs =
    user?.role === 'ADMIN'
      ? [...TABS, { to: '/admin', label: 'Admin', end: false }]
      : TABS

  const initials = (user?.display_name ?? '?')
    .split(' ')
    .map((s) => s[0])
    .slice(0, 2)
    .join('')

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-grad-brand text-white shadow-sm">
            <CalendarClock className="h-[18px] w-[18px]" />
          </div>
          <span className="font-display text-[17px] font-semibold tracking-tight text-ink">Rooms</span>
        </div>

        <nav className="flex items-center gap-1" aria-label="Primary">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  isActive ? 'bg-accent/10 text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-ink-2 sm:inline">
            IST · UTC+5:30
          </span>
          <div
            className="grid h-8 w-8 place-items-center rounded-full bg-grad-lime text-xs font-semibold text-white"
            title={user?.display_name}
            aria-hidden
          >
            {initials.toUpperCase()}
          </div>
          <button
            onClick={async () => {
              await logout()
              navigate('/login', { replace: true })
            }}
            className="text-ink-3 transition-colors hover:text-ink-2"
            aria-label="Log out"
          >
            <LogOut className="h-[18px] w-[18px]" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
