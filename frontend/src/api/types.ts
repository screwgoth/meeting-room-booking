// API contract types — mirror the shapes proposed to Sam (ARCHITECTURE §2/§5a,
// issues #1,#5,#6,#7,#8). Kept in one place so swapping mocks → live endpoints is
// a config flip, not a refactor. Times are UTC ISO8601 (`Z`); render in `timezone`.

export type Role = 'EMPLOYEE' | 'ADMIN'

export interface User {
  id: number
  username: string
  display_name: string
  role: Role
}

export interface Office {
  id: number
  name: string
}

export interface Floor {
  id: number
  name: string
}

export interface Facility {
  id: number
  name: string
}

export interface RoomBooking {
  id: number
  start: string // ISO8601Z
  end: string // ISO8601Z
  title: string
  is_mine: boolean
}

export interface AvailabilityRoom {
  id: number
  name: string
  floor: Floor
  capacity: number
  facilities: Facility[]
  bookings: RoomBooking[]
  /** Meets capacity + required facilities filter (undefined when no such filter). */
  fits: boolean
  /** Free for the *entire* filtered time window (undefined when no time filter). */
  free_in_window: boolean
}

export interface AvailabilityResponse {
  date: string // YYYY-MM-DD
  timezone: string // IANA, e.g. "Asia/Kolkata"
  window: { start: string; end: string } // "08:00" / "20:00"
  rooms: AvailabilityRoom[]
}

export interface AvailabilityQuery {
  office: number
  date: string
  floor?: number
  start?: string // "HH:MM"
  end?: string // "HH:MM"
  capacity?: number
  facilities?: number[]
}

export interface BookingLocation {
  office: string
  floor: string
  room: string
}

export interface Booking {
  id: number
  room_id: number
  location: BookingLocation
  start: string
  end: string
  title: string
  attendee_count: number | null
  status: 'confirmed' | 'cancelled'
}

export interface BookingWarning {
  code: 'attendees_over_capacity' | string
  message: string
}

export interface CreateBookingRequest {
  room_id: number
  start: string // ISO8601Z, 15-min aligned
  end: string // ISO8601Z, 15-min aligned
  title: string
  attendee_count?: number | null
}

export interface CreateBookingResponse {
  booking: Booking
  warnings: BookingWarning[]
}

export interface MyBookingsResponse {
  upcoming: Booking[]
  past: Booking[]
}
