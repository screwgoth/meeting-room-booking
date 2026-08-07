// Public API surface. One switch (VITE_USE_MOCKS) routes every call to the in-memory
// mock or Sam's live endpoints. Defaults to mocks until the backend is wired; flip
// with `VITE_USE_MOCKS=false` (or once Sam confirms, we drop the mock branch).

import { apiFetch } from './client'
import { mockApi } from './mock'
import type {
  AvailabilityQuery,
  AvailabilityResponse,
  Booking,
  CreateBookingRequest,
  CreateBookingResponse,
  Facility,
  Floor,
  MyBookingsResponse,
  Office,
  User,
} from './types'

const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

function qs(params: Record<string, string | number | undefined | number[]>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v == null) continue
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

export const api = {
  login: (username: string, password: string) =>
    USE_MOCKS
      ? mockApi.login(username, password)
      : apiFetch<{ user: User }>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ username, password }),
        }),

  me: () => (USE_MOCKS ? mockApi.me() : apiFetch<{ user: User }>('/api/auth/me')),

  logout: () =>
    USE_MOCKS ? mockApi.logout() : apiFetch<void>('/api/auth/logout', { method: 'POST' }),

  offices: () => (USE_MOCKS ? mockApi.offices() : apiFetch<Office[]>('/api/offices')),

  floors: (officeId: number) =>
    USE_MOCKS ? mockApi.floors(officeId) : apiFetch<Floor[]>(`/api/offices/${officeId}/floors`),

  facilities: () => (USE_MOCKS ? mockApi.facilities() : apiFetch<Facility[]>('/api/facilities')),

  availability: (q: AvailabilityQuery) =>
    USE_MOCKS
      ? mockApi.availability(q)
      : apiFetch<AvailabilityResponse>(
          `/api/availability${qs({
            office: q.office,
            date: q.date,
            floor: q.floor,
            start: q.start,
            end: q.end,
            capacity: q.capacity,
            facilities: q.facilities,
          })}`,
        ),

  createBooking: (req: CreateBookingRequest) =>
    USE_MOCKS
      ? mockApi.createBooking(req)
      : apiFetch<CreateBookingResponse>('/api/bookings', {
          method: 'POST',
          body: JSON.stringify(req),
        }),

  myBookings: () =>
    USE_MOCKS ? mockApi.myBookings() : apiFetch<MyBookingsResponse>('/api/bookings/mine'),

  cancelBooking: (id: number, reason?: string) =>
    USE_MOCKS
      ? mockApi.cancelBooking(id)
      : apiFetch<{ booking: Booking }>(`/api/bookings/${id}/cancel`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }),
}

export type { AvailabilityQuery } from './types'
export * from './types'
export { ApiError } from './client'
