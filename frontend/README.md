# Frontend — meeting-room-booking

Owner: **Nemo**. React (Vite) SPA over the DRF JSON API. See `../docs/ARCHITECTURE.md`.

This directory is the frontend lane. Everything client-side (Vite app, components,
API client) lives here. Do not touch `../backend/`.

Design reference: Priya's mockup at `~/artifacts/mockups/meeting-room-booking/index.html`
and `design-rationale.md`. Design locks are in ARCHITECTURE.md **§5a**.

## Phase 1 scope (this branch)
- Vite + React scaffold, API client, auth/login flow (local username/password), session handling.
- App shell + routing; Employee vs Admin views gated by role.
- Push as far into the core loop as lands cleanly: office/floor picker, **15-min availability grid**
  (window 08:00–20:00, grey-out passed slots), filters (time/capacity/facilities),
  book-the-filtered-window (≤2 clicks), My Bookings + cancel.
- Capacity over-book = **soft warning** confirm prompt, never a hard block (§5a / §2 API contract).

Coordinate the API contract with Sam via ARCHITECTURE.md §2/§3; if a field is unspecified,
ping Sam (agentId: sam) rather than guessing.
