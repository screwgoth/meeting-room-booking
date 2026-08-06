# Backend — meeting-room-booking

Owner: **Sam**. Django + DRF over PostgreSQL 15+. See `../docs/ARCHITECTURE.md`.

This directory is the backend lane. Everything server-side (Django project,
apps, migrations, tests) lives here. Do not touch `../frontend/`.

## Phase 1 scope (this branch)
- Project scaffold (Django + DRF, settings, Postgres wiring).
- **#2 Data model**: Org → Office → Floor → Room, facility, room_facility, app_user, booking.
- **§2 concurrency constraint FIRST** + its deterministic race test (the linchpin — build before booking UI).
- **#1 Auth & roles**: local username/password (argon2/bcrypt), Employee/Admin, server-side RBAC, LDAP-ready seam (§4).
- Push as far into #3–#8 as lands cleanly (Office/Floor/Room/facility CRUD, availability query, booking endpoint with 409-on-23P01, my-bookings + cancel).

See ARCHITECTURE.md §2 (API contract), §3 (data model), §4 (auth seam), §6 (stack).
