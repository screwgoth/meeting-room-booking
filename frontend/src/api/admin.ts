// Admin (masters) API. Always hits the live backend — the mock layer only covers
// the employee money-path. Admin pages are ADMIN-gated server-side (NF2); the UI
// gate is convenience only. Envelopes are unwrapped so callers get flat data.

import { apiFetch } from './client'
import type { Role } from './types'

export interface AdminUser {
  id: number
  username: string
  email: string | null
  display_name: string
  role: Role
  auth_source: 'LOCAL' | 'LDAP'
  is_active: boolean
}

export interface AdminOffice {
  id: number
  org_id: number
  name: string
  timezone: string | null
  is_active: boolean
}
export interface AdminFloor {
  id: number
  office_id: number
  name: string
  is_active: boolean
}
export interface AdminRoom {
  id: number
  floor_id: number
  name: string
  capacity: number
  is_active: boolean
}
export interface AdminFacility {
  id: number
  name: string
  is_active: boolean
}

export interface AdminBooking {
  id: number
  room_id: number
  location: { office: string; floor: string; room: string }
  start: string // ISO8601Z
  end: string // ISO8601Z
  title: string
  attendee_count: number | null
  status: 'confirmed' | 'cancelled'
  owner: { id: number; username: string; display_name: string }
}

export interface UpdateBookingBody {
  room_id: number
  start: string
  end: string
  title: string
  attendee_count?: number | null
  owner_user_id?: number
}

export interface CreateUserBody {
  username: string
  displayName: string
  email?: string
  role: Role
  password: string
}
export interface UpdateUserBody {
  displayName?: string
  email?: string | null
  role?: Role
  isActive?: boolean
  password?: string
}

const body = (v: unknown) => JSON.stringify(v)

export const adminApi = {
  // ---- Users ---------------------------------------------------------------
  listUsers: () =>
    apiFetch<{ users: AdminUser[] }>('/api/admin/users').then((r) => r.users),
  createUser: (b: CreateUserBody) =>
    apiFetch<{ user: AdminUser }>('/api/admin/users', { method: 'POST', body: body(b) }).then(
      (r) => r.user,
    ),
  updateUser: (id: number, b: UpdateUserBody) =>
    apiFetch<{ user: AdminUser }>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: body(b),
    }).then((r) => r.user),

  // ---- Bookings (admin console) -------------------------------------------
  listBookings: () =>
    apiFetch<{ bookings: AdminBooking[] }>('/api/admin/bookings').then((r) => r.bookings),
  updateBooking: (id: number, b: UpdateBookingBody) =>
    apiFetch<{ booking: AdminBooking }>(`/api/bookings/${id}`, {
      method: 'PATCH',
      body: body(b),
    }).then((r) => r.booking),
  cancelBooking: (id: number, reason?: string) =>
    apiFetch<{ booking: AdminBooking }>(`/api/bookings/${id}/cancel`, {
      method: 'POST',
      body: body({ reason }),
    }).then((r) => r.booking),

  // ---- Offices -------------------------------------------------------------
  listOffices: () =>
    apiFetch<{ offices: AdminOffice[] }>('/api/offices?includeInactive=true').then(
      (r) => r.offices,
    ),
  createOffice: (name: string) =>
    apiFetch<{ office: AdminOffice }>('/api/admin/offices', {
      method: 'POST',
      body: body({ name }),
    }).then((r) => r.office),
  updateOffice: (id: number, b: { name?: string; isActive?: boolean }) =>
    apiFetch<{ office: AdminOffice }>(`/api/admin/offices/${id}`, {
      method: 'PATCH',
      body: body(b),
    }).then((r) => r.office),

  // ---- Floors --------------------------------------------------------------
  listFloors: (officeId: number) =>
    apiFetch<{ floors: AdminFloor[] }>(
      `/api/offices/${officeId}/floors?includeInactive=true`,
    ).then((r) => r.floors),
  createFloor: (officeId: number, name: string) =>
    apiFetch<{ floor: AdminFloor }>(`/api/admin/offices/${officeId}/floors`, {
      method: 'POST',
      body: body({ name }),
    }).then((r) => r.floor),
  updateFloor: (id: number, b: { name?: string; isActive?: boolean }) =>
    apiFetch<{ floor: AdminFloor }>(`/api/admin/floors/${id}`, {
      method: 'PATCH',
      body: body(b),
    }).then((r) => r.floor),

  // ---- Rooms ---------------------------------------------------------------
  listRooms: (floorId: number) =>
    apiFetch<{ rooms: AdminRoom[] }>(`/api/floors/${floorId}/rooms?includeInactive=true`).then(
      (r) => r.rooms,
    ),
  roomFacilities: (id: number) =>
    apiFetch<{ room: AdminRoom & { facilityIds: number[] } }>(`/api/admin/rooms/${id}`).then(
      (r) => r.room,
    ),
  createRoom: (b: { floorId: number; name: string; capacity: number; facilityIds: number[] }) =>
    apiFetch<{ room: AdminRoom }>('/api/admin/rooms', { method: 'POST', body: body(b) }).then(
      (r) => r.room,
    ),
  updateRoom: (
    id: number,
    b: { name?: string; capacity?: number; isActive?: boolean; facilityIds?: number[] },
  ) =>
    apiFetch<{ room: AdminRoom }>(`/api/admin/rooms/${id}`, {
      method: 'PATCH',
      body: body(b),
    }).then((r) => r.room),

  // ---- Facilities (must-haves) --------------------------------------------
  listFacilities: () =>
    apiFetch<{ facilities: AdminFacility[] }>('/api/admin/facilities').then((r) => r.facilities),
  createFacility: (name: string) =>
    apiFetch<{ facility: AdminFacility }>('/api/admin/facilities', {
      method: 'POST',
      body: body({ name }),
    }).then((r) => r.facility),
  updateFacility: (id: number, b: { name?: string; isActive?: boolean }) =>
    apiFetch<{ facility: AdminFacility }>(`/api/admin/facilities/${id}`, {
      method: 'PATCH',
      body: body(b),
    }).then((r) => r.facility),
}
