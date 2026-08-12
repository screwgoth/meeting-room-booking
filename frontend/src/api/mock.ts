// In-memory mock backend implementing the proposed contract faithfully enough to
// build and test the whole money path before Sam's endpoints land. It reproduces the
// load-bearing behaviors from ARCHITECTURE §2/§5a:
//   • overlap on a confirmed booking → 409 (the zero-double-booking invariant)
//   • off-grid / end≤start / past-start → 422 (the D1 grid guard)
//   • attendees > capacity → non-blocking warnings[] (soft warning, never 4xx)
// Swapping to the live API is a flag flip in endpoints.ts — shapes are identical.

import { ApiError } from './client'
import {
  GRID_END_HOUR,
  GRID_START_HOUR,
  SLOT_MINUTES,
  now,
  todayInTz,
  zonedHM,
  zonedWallToUtc,
} from '@/lib/time'
import type {
  AvailabilityQuery,
  AvailabilityResponse,
  AvailabilityRoom,
  Booking,
  CreateBookingRequest,
  CreateBookingResponse,
  Facility,
  Floor,
  MyBookingsResponse,
  Office,
  User,
} from './types'

const TZ = 'Asia/Kolkata'

const USERS: (User & { password: string })[] = [
  { id: 1, username: 'employee', password: 'password', display_name: 'Riya Sharma', role: 'EMPLOYEE' },
  { id: 2, username: 'admin', password: 'password', display_name: 'Admin User', role: 'ADMIN' },
]

const OFFICES: Office[] = [{ id: 1, name: 'HQ · Bengaluru' }]
const FLOORS: (Floor & { office_id: number })[] = [
  { id: 1, name: 'Ground', office_id: 1 },
  { id: 2, name: 'Level 3', office_id: 1 },
  { id: 3, name: 'Level 5', office_id: 1 },
]
const FACILITIES: Facility[] = [
  { id: 1, name: 'TV/Screen' },
  { id: 2, name: 'Video conf' },
  { id: 3, name: 'Projector' },
  { id: 4, name: 'Whiteboard' },
]

interface MockRoom {
  id: number
  name: string
  floor_id: number
  capacity: number
  facility_ids: number[]
}
const ROOMS: MockRoom[] = [
  { id: 1, name: 'Lisbon', floor_id: 1, capacity: 6, facility_ids: [1, 2, 4] },
  { id: 2, name: 'Oslo', floor_id: 1, capacity: 4, facility_ids: [4] },
  { id: 3, name: 'Kyoto', floor_id: 2, capacity: 10, facility_ids: [1, 2, 3, 4] },
  { id: 4, name: 'Cairo', floor_id: 2, capacity: 2, facility_ids: [2] },
  { id: 5, name: 'Nairobi', floor_id: 3, capacity: 8, facility_ids: [1, 2, 4] },
  { id: 6, name: 'Quito', floor_id: 3, capacity: 14, facility_ids: [1, 2, 3, 4] },
]

interface MockBooking {
  id: number
  room_id: number
  user_id: number
  startMs: number
  endMs: number
  title: string
  attendee_count: number | null
  status: 'confirmed' | 'cancelled'
}

let seq = 100
let bookings: MockBooking[] = []
let session: User | null = null

function iso(ms: number): string {
  return new Date(ms).toISOString()
}
function locationOf(room: MockRoom) {
  const floor = FLOORS.find((f) => f.id === room.floor_id)!
  const office = OFFICES.find((o) => o.id === floor.office_id)!
  return { office: office.name, floor: floor.name, room: room.name }
}
function toBooking(b: MockBooking): Booking {
  const room = ROOMS.find((r) => r.id === b.room_id)!
  return {
    id: b.id,
    room_id: b.room_id,
    location: locationOf(room),
    start: iso(b.startMs),
    end: iso(b.endMs),
    title: b.title,
    attendee_count: b.attendee_count,
    status: b.status,
  }
}

/** Seed demo bookings for "today" in IST — includes the Lisbon 14:00–15:00 conflict
 * demo Priya calls out, plus one booking owned by the current employee. */
function seed() {
  bookings = []
  seq = 100
  const today = todayInTz(TZ)
  const at = (h: number, m: number) => zonedWallToUtc(today, h, m, TZ).getTime()
  const add = (room_id: number, user_id: number, sh: number, sm: number, eh: number, em: number, title: string) =>
    bookings.push({
      id: ++seq,
      room_id,
      user_id,
      startMs: at(sh, sm),
      endMs: at(eh, em),
      title,
      attendee_count: null,
      status: 'confirmed',
    })
  add(1, 3, 14, 0, 15, 0, 'Design review') // Lisbon busy in the demo window
  add(3, 3, 9, 0, 10, 30, 'All-hands prep')
  add(5, 1, 11, 0, 12, 0, 'My 1:1') // owned by employee (user 1)
  add(6, 3, 16, 0, 18, 0, 'Board sync')
}
seed()

/** Reset store — used by tests. */
export function __resetMock() {
  session = null
  seed()
}
export function __login(username = 'employee') {
  session = USERS.find((u) => u.username === username) ?? null
}

function requireAuth(): User {
  if (!session) throw new ApiError(401, 'Not authenticated', { detail: 'Not authenticated' })
  return session
}

function overlaps(aS: number, aE: number, bS: number, bE: number): boolean {
  // half-open [start,end): back-to-back does not overlap (§2 detail #2)
  return aS < bE && bS < aE
}

function isGridAligned(ms: number): boolean {
  const { m } = zonedHM(new Date(ms), TZ)
  return m % SLOT_MINUTES === 0
}

export const mockApi = {
  async login(username: string, password: string): Promise<{ user: User }> {
    const u = USERS.find((x) => x.username === username && x.password === password)
    if (!u) throw new ApiError(401, 'Invalid username or password', { detail: 'Invalid username or password' })
    session = { id: u.id, username: u.username, display_name: u.display_name, role: u.role }
    return { user: session }
  },
  async me(): Promise<{ user: User }> {
    return { user: requireAuth() }
  },
  async logout(): Promise<void> {
    session = null
  },
  async offices(): Promise<Office[]> {
    requireAuth()
    return OFFICES
  },
  async floors(officeId: number): Promise<Floor[]> {
    requireAuth()
    return FLOORS.filter((f) => f.office_id === officeId).map(({ id, name }) => ({ id, name }))
  },
  async facilities(): Promise<Facility[]> {
    requireAuth()
    return FACILITIES
  },

  async availability(q: AvailabilityQuery): Promise<AvailabilityResponse> {
    requireAuth()
    const winStart = q.start ? zonedWallToUtc(q.date, ...hm(q.start), TZ).getTime() : null
    const winEnd = q.end ? zonedWallToUtc(q.date, ...hm(q.end), TZ).getTime() : null
    const dayStart = zonedWallToUtc(q.date, GRID_START_HOUR, 0, TZ).getTime()
    const dayEnd = zonedWallToUtc(q.date, GRID_END_HOUR, 0, TZ).getTime()

    const rooms: AvailabilityRoom[] = ROOMS.filter((r) => {
      const floor = FLOORS.find((f) => f.id === r.floor_id)!
      if (floor.office_id !== q.office) return false
      if (q.floor && r.floor_id !== q.floor) return false
      return true
    }).map((r) => {
      const floor = FLOORS.find((f) => f.id === r.floor_id)!
      const roomBookings = bookings
        .filter((b) => b.room_id === r.id && b.status === 'confirmed')
        .filter((b) => b.endMs > dayStart && b.startMs < dayEnd)
        .sort((a, b) => a.startMs - b.startMs)

      const capacityOk = q.capacity == null || r.capacity >= q.capacity
      const facilitiesOk =
        !q.facilities || q.facilities.every((fid) => r.facility_ids.includes(fid))
      const fits = capacityOk && facilitiesOk

      let freeInWindow = true
      if (winStart != null && winEnd != null) {
        freeInWindow = !roomBookings.some((b) => overlaps(b.startMs, b.endMs, winStart, winEnd))
      }

      return {
        id: r.id,
        name: r.name,
        floor: { id: floor.id, name: floor.name },
        capacity: r.capacity,
        facilities: FACILITIES.filter((f) => r.facility_ids.includes(f.id)),
        bookings: roomBookings.map((b) => ({
          id: b.id,
          start: iso(b.startMs),
          end: iso(b.endMs),
          title: b.title,
          is_mine: !!session && b.user_id === session.id,
        })),
        fits,
        free_in_window: freeInWindow,
      }
    })

    return {
      date: q.date,
      timezone: TZ,
      window: { start: '08:00', end: '20:00' },
      rooms,
    }
  },

  async createBooking(req: CreateBookingRequest): Promise<CreateBookingResponse> {
    const user = requireAuth()
    const startMs = new Date(req.start).getTime()
    const endMs = new Date(req.end).getTime()
    const room = ROOMS.find((r) => r.id === req.room_id)

    // 422 — validation / D1 grid guard (server never trusts the client)
    if (!room) throw new ApiError(422, 'Unknown room', { detail: 'Unknown room' })
    if (!req.title?.trim()) throw new ApiError(422, 'Title is required', { detail: 'Title is required' })
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs)
      throw new ApiError(422, 'End must be after start', { detail: 'End must be after start' })
    if (!isGridAligned(startMs) || !isGridAligned(endMs) || (endMs - startMs) % (SLOT_MINUTES * 60000) !== 0)
      throw new ApiError(422, 'Times must fall on 15-minute boundaries', {
        detail: 'Times must fall on 15-minute boundaries',
      })
    if (startMs < now().getTime())
      throw new ApiError(422, 'Cannot book a time in the past', { detail: 'Cannot book a time in the past' })

    // 409 — overlap on a confirmed booking (the invariant)
    const clash = bookings.some(
      (b) => b.room_id === req.room_id && b.status === 'confirmed' && overlaps(b.startMs, b.endMs, startMs, endMs),
    )
    if (clash)
      throw new ApiError(409, 'Room was just taken for that time', {
        detail: 'Room was just taken for that time',
      })

    const booking: MockBooking = {
      id: ++seq,
      room_id: req.room_id,
      user_id: user.id,
      startMs,
      endMs,
      title: req.title.trim(),
      attendee_count: req.attendee_count ?? null,
      status: 'confirmed',
    }
    bookings.push(booking)

    const warnings =
      req.attendee_count != null && req.attendee_count > room.capacity
        ? [
            {
              code: 'attendees_over_capacity',
              message: `Seats ${room.capacity}, you entered ${req.attendee_count}.`,
            },
          ]
        : []
    return { booking: toBooking(booking), warnings }
  },

  async myBookings(): Promise<MyBookingsResponse> {
    const user = requireAuth()
    const nowMs = now().getTime()
    const mine = bookings
      .filter((b) => b.user_id === user.id && b.status === 'confirmed')
      .sort((a, b) => a.startMs - b.startMs)
    return {
      upcoming: mine.filter((b) => b.endMs > nowMs).map(toBooking),
      past: mine.filter((b) => b.endMs <= nowMs).map(toBooking),
    }
  },

  async cancelBooking(id: number): Promise<{ booking: Booking }> {
    const user = requireAuth()
    const b = bookings.find((x) => x.id === id)
    if (!b) throw new ApiError(404, 'Booking not found', { detail: 'Booking not found' })
    if (b.user_id !== user.id)
      throw new ApiError(403, 'You can only cancel your own bookings', {
        detail: 'You can only cancel your own bookings',
      })
    if (b.endMs <= now().getTime())
      throw new ApiError(422, 'Past bookings cannot be cancelled', {
        detail: 'Past bookings cannot be cancelled',
      })
    b.status = 'cancelled'
    return { booking: toBooking(b) }
  },
}

function hm(s: string): [number, number] {
  const [h, m] = s.split(':').map(Number)
  return [h, m]
}
