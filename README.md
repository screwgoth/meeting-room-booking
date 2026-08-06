# Meeting Room Booking

Internal, single-organization web app for booking meeting rooms across a
multi-office organization.

**Hierarchy:** Org → Office → Floor → Room.

## MVP scope (locked 2026-08-06)
- Local username/password auth (Employee / Admin roles); LDAP/AD directory bind is the v2 swap-in.
- Admin manages Offices, Floors, and Rooms (capacity + facilities).
- Employees pick an office (optional floor), filter by time / capacity / facilities,
  and see availability on a **fixed 15-minute grid**.
- Book a contiguous block of 15-min slots — **guaranteed conflict-free** (server-side atomic guarantee).
- My Bookings: view + cancel.

Single display timezone for MVP (per-office timezone is v2). Advanced features
(recurring, approvals, no-show/check-in, calendar sync, notifications, analytics) are v2/v3.

PRD & issue backlog: product artifacts (not committed) — `~/artifacts/prds/meeting-room-booking/`.
