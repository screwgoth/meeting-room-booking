# ARCHITECTURE — Meeting Room Booking

**Slug:** `meeting-room-booking` · **Author:** Alex (Solution Architect) · **Date:** 2026-08-06
**Status:** ✅ **FINAL — PRD approved by Screwgoth 2026-08-06; full architecture cleared.** Aligned to PRD **§0 Locked Decisions D1–D5** plus the 2026-08-06 handoff locks (per-office admin scoping = **P1**, global admin v1; Priya's 4 design defaults accepted — see §5a). §2 (concurrency) is the linchpin verdict; §3–§9 are signed off. **Sam (backend) + Nemo (frontend) unlock on this doc.**
**Preview:** https://openclaw-vps.tail965924.ts.net:8443
**Repo:** `screwgoth/meeting-room-booking` (P0 issues #1–#8 live) · `git@github.com:screwgoth/meeting-room-booking.git`

> Decision record, not an encyclopedia. §2 (concurrency) is stable and unaffected by every scope delta. Items marked ⚠ need Screwgoth.

### Change log (traces to PRD §0)
- **D1 — Booking model = FIXED 15-min grid slots** (start/end snap to `:00/:15/:30/:45`; duration = whole number of 15-min slots). Supersedes the earlier free-range call (old A10). **Concurrency spike (§2) unchanged** — grid alignment is a *validation guard*; overlap detection still runs on `tstzrange`.
- **D2 — Auth = local username/password now → LDAP/AD directory bind later.** NOT OIDC. Abstraction retargeted (§4).
- **D3 — Multi-office hierarchy IN MVP: Org → Office → Floor → Room** (§3, §5). Kills single-location.
- **D4 — Advanced features → v2/v3** (recurring, approvals, no-show, calendar sync, notifications, analytics). MVP stays lean.
- **D5 — Single display timezone for MVP** (store UTC, render one configured tz). Per-office tz is v2 — I keep a **dormant nullable `office.timezone` seam** now (per §10) so v2 is additive; it carries no behavior in v1.
- **2026-08-06 handoff locks** — **per-office admin scoping = P1** (v1 ships **global admin**; the `office_id`-on-grant seam in §4 stays dormant). **Priya's 4 design defaults accepted** (§5a): grid window **08:00–20:00**, **grey-out passed slots**, **book exactly the filtered window** (drag-select = P1), **attendees > capacity = soft warning** (non-blocking).

---

## 1. Context & constraints

- **Deployment shape: internal, single-org standalone web app** with a **multi-office** footprint (Org→Office→Floor→Room, MVP). Not multi-tenant SaaS, not federated. One org, one deployment, many offices. Defaults: username/password auth (LDAP/AD-ready), single Postgres, a monolith.
- **The product IS one invariant:** zero double-booking, enforced server-side, never UI-only (F6/NF1). Everything else is standard CRUD. Complexity budget is spent *there*; boring everywhere else.
- **Scale (OQ#2, unknown):** internal org ⇒ hundreds–low-thousands of employees, tens–low-hundreds of rooms across offices, low bursty write concurrency (:00/:15/:30/:45). Sizing changes no pattern below; confirms we need nothing fancier (no cache tier, no queue, no sharding).
- **Booking model (D1):** **fixed 15-min grid** — bookings are a contiguous block of whole 15-min slots aligned to `:00/:15/:30/:45`. Stored as a `tstzrange` (the grid is a validation guard, not a change in storage or overlap logic).

---

## 2. ⭐ Concurrency verdict (issue #6/#7 — the spike) — FINAL

### Verdict: **Postgres `tstzrange` + `EXCLUDE USING gist` exclusion constraint.** Not app-level locking, not serializable-txn-as-primary. **Unaffected by D1/D2/D3** — the constraint keys on globally-unique `room_id` over a time range; grid alignment and hierarchy depth are both invisible to it.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- needed for the `=` on room_id inside a GiST index

-- booking.during is tstzrange, stored half-open [start, end), grid-aligned to 15 min (D1)
ALTER TABLE booking ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (room_id WITH =, during WITH &&)
  WHERE (status = 'confirmed');
```

Three details are load-bearing:
1. **`WHERE (status = 'confirmed')`** — partial exclusion. Cancelled bookings must not block the slot (F7). Cancellation is a `status` flip, never a hard delete → history preserved (NF5).
2. **Half-open `[)` ranges** — back-to-back `10:00–10:15` and `10:15–10:30` do **not** overlap. Matches zero-buffer + the 15-min grid.
3. **`btree_gist`** — so `room_id WITH =` can live in the same GiST index as the range operator.

### Why this wins — concurrency failure mode of each candidate

| Approach | Concurrent-write failure mode | Verdict |
|---|---|---|
| **Naive app check-then-insert** | **TOCTOU phantom race.** A reads "free" ✅; B reads "free" ✅ (B's snapshot can't see A's uncommitted row); both insert; both commit → **double-booking.** Exactly issue #6/#7's hardest AC. | ❌ Broken |
| **`SELECT … FOR UPDATE`** | Locks *existing* overlapping rows — but the conflicting row **doesn't exist yet**; nothing to lock. Only works if you lock the parent `room` row as a hand-rolled mutex. | ❌ Misses the phantom |
| **Advisory lock `pg_advisory_xact_lock(room_id)`** | Correct *if perfectly disciplined* — guarantee lives in app convention; one forgotten path/new service/admin script → invariant gone. Also serializes a whole room needlessly. | ⚠️ Works, fragile |
| **`SERIALIZABLE` isolation** | Correct — SSI aborts one txn with `40001`. But needs SERIALIZABLE on *every* booking txn + app-wide retry loops; more moving parts for the same result. | ⚠️ Works, heavier |
| **`EXCLUDE` constraint** ⭐ | Index-level predicate locking. Overlapping inserts → first commits, second **blocks then fails with `23P01 exclusion_violation`.** Correct at default **READ COMMITTED** — no isolation bump, no retry loop. **Non-bypassable by any code path.** | ✅ **Pick** |

**Decisive argument:** the invariant that *is the product* belongs at the lowest, non-bypassable layer — the schema. A constraint can't be forgotten by a new endpoint, an import script, a buggy retry, or a future service. It's *less* code than the locking options and the only one that defeats the phantom by construction rather than discipline. Serializable/advisory are correct-but-fragile fallbacks, not the primary.

### API contract for Sam
- Insert the booking in one transaction. **Do not** pre-lock; let the constraint arbitrate.
- Catch Postgres SQLSTATE **`23P01`** → **HTTP 409 Conflict** ("room was just taken"). Everything else propagates.
- **Grid validation guard (D1), applied *before* insert, separate from the overlap guarantee:** reject unless `lower(during)` and `upper(during)` land on 15-min boundaries and `(upper−lower)` is a positive whole multiple of 15 min. Plus policy: `end>start`, ≤ max duration, within horizon (F8). Enforce as app validation + optionally a `CHECK` (e.g. `EXTRACT(EPOCH FROM lower(during))::bigint % 900 = 0`).
- Cheap availability pre-check is **UX only** ("looks taken"); it is *never* the guarantee. Truth = the constraint.
- **`attendee_count > room.capacity` is a *soft warning*, not a rejection** (design lock §5a): the API accepts the booking and returns a non-blocking `warnings[]` flag; the frontend confirms with a "seats X, you entered Y — book anyway?" prompt. Capacity is a *filter* dimension (F5), not a hard booking constraint.

### Concurrency test approach for Quinn (two-users-same-slot AC)
1. **Deterministic race (money test):** two DB txns both `INSERT` the same `room_id` + overlapping `during`. Commit A then B → assert exactly one succeeds, B raises `23P01`. Repeat B-then-A. Proves it without timing luck.
2. **HTTP parallel submit:** N concurrent `POST /bookings` for the identical room+slot (20 threads / `asyncio.gather` / `k6`). Assert **exactly one 201, rest 409**, table holds one confirmed row.
3. **Boundary:** back-to-back `[10:00,10:15)` + `[10:15,10:30)` → both succeed. One-slot overlap → rejected. Off-grid (`10:07`) → rejected by the D1 guard *before* the constraint.
4. **Cancel-frees-slot:** book → cancel (status→cancelled) → re-book same slot → succeeds (proves the partial index).
5. Wire test #1 into CI as a regression gate — it's the product promise.

---

## 3. Data model (core entities)

```
org(id, name, default_timezone, created_at)                  -- single row v1; top of hierarchy
office(id, org_id FK, name, timezone NULL, is_active)         -- D5: timezone dormant in v1 (NULL ⇒ org.default_timezone); lights up v2
floor(id, office_id FK, name/label, is_active)               -- first-class; replaces old free-text floor label
room(id, floor_id FK, name, capacity INT CHECK(capacity>0),
     is_active BOOL, created_at)                             -- soft-delete via is_active; office/org reached via floor→office
   -- hierarchy: room → floor → office → org

app_user(id, username UNIQUE, email, display_name, role[EMPLOYEE|ADMIN],
         password_hash NULLABLE, auth_source[LOCAL|LDAP], directory_id NULLABLE,
         is_active, created_at)
   -- v1 login = username/password (LOCAL, argon2/bcrypt); password_hash null for LDAP users
   -- UNIQUE(auth_source, directory_id) for LDAP accounts

facility(id, name UNIQUE, is_active)                          -- managed tag set, admin-editable
room_facility(room_id FK, facility_id FK, PK(room_id,facility_id))

booking(id, room_id FK, user_id FK,
        during TSTZRANGE NOT NULL,          -- [start,end) UTC, 15-min-grid-aligned (D1)
        title TEXT NOT NULL, attendee_count INT NULL,
        status TEXT[confirmed|cancelled] DEFAULT 'confirmed',
        cancelled_by FK NULL, cancel_reason TEXT NULL,
        created_at, updated_at)
   -- CONSTRAINT booking_no_overlap (see §2) — unchanged by hierarchy or grid
   -- CHECK (upper(during) > lower(during)); optional CHECK for 15-min grid alignment
   -- index (user_id, lower(during)) for "My bookings"; GiST index backs the constraint
```

- **Soft-delete everywhere (NF5) + block-delete-non-empty (D3/§10):** deactivating an office/floor/room is an `is_active` flip; a **hard delete of a non-empty office/floor is blocked** (an office with active floors, or a floor with active/future-booked rooms, cannot be deleted — deactivate instead). Bookings/floors/rooms are never orphaned.
- **Hierarchy indexes:** `room(floor_id)`, `floor(office_id)`, `office(org_id)` for cheap office→floor→room scoping.
- **Booking references `room_id` directly** — overlap constraint and every write path are hierarchy- and grid-agnostic. Office/floor are join-for-filter/display only.
- **Times: UTC in `tstzrange`, rendered in the single org display tz for v1 (D5/NF3).** Never store local time.
- **Availability read model (NF4):** **live query**, **office-scoped (floor optional)** per §10; GiST index makes range-overlap lookups cheap. No cache tier → no stale free/busy by construction.
- **Facilities filter (F4):** "has *all* required facilities" = `GROUP BY room_id HAVING count(required ∩ room)=|required|`, combined with office/floor scope + capacity + active + free-for-window.

---

## 4. Auth abstraction (LDAP/AD-ready — showing the seam)

**v1 = local username/password. v2 swap-in = LDAP/AD directory bind. NOT OIDC.** One **identity-resolution port**; the LDAP adapter drops in without touching callers.

```
interface IdentityProvider:
    authenticate(credentials) -> Principal        # Principal = (user_id, username, role, ...)

# v1 adapter — local accounts
class LocalPasswordProvider(IdentityProvider):
    authenticate(username, password):
        user = users.by_username(username)
        verify_hash(password, user.password_hash)           # argon2id / bcrypt
        return Principal(user)

# v2 drop-in — NO change to callers, routes, or session layer
class LdapProvider(IdentityProvider):
    authenticate(username, password):
        conn  = ldap_bind(BIND_DN_template.format(username), password)   # AD/LDAP bind IS the auth
        entry = conn.search(user_dn, attrs=['objectGUID','mail','displayName','memberOf'])
        user  = users.upsert_by(auth_source='LDAP', directory_id=entry.objectGUID,
                                username=username, email=entry.mail, name=entry.displayName)
        return Principal(user, role=map_ldap_groups_to_role(entry.memberOf))
```

- **Downstream is provider-agnostic:** session issuance, RBAC, `@require_role(ADMIN)` key off `Principal.role` — identical for local or LDAP.
- **Schema seam already present** (`auth_source`, `directory_id` = AD `objectGUID`/DN, nullable `password_hash`) — LDAP users slot in with no migration. LDAP auth is *bind-based*: we never store the directory password.
- **Framework leverage:** with Django (§6) this port *is* the pluggable `AUTHENTICATION_BACKENDS`; the v2 adapter is the battle-tested **`django-auth-ldap`** (AD groups → roles out of the box). Node: `passport-ldapauth`.
- **RBAC (NF2):** role checks server-side on every admin action (403), never UI-gated. Per-office admin scoping (OQ#9) is additive (`office_id` on an admin grant) once offices exist.
- ⚠️ **Gate:** confirm **AD vs generic LDAP**, bind strategy (direct-bind vs service-account search-then-bind), and AD-group→role mapping before the v2 adapter. v1 local-password + seam ships regardless.

---

## 5. Timezone + office hierarchy

**Foundation:** store UTC + render one configured org display tz for v1 (D5). Multi-office **hierarchy is MVP**; **per-office tz is v2**.

- The `office.timezone` column exists now but is **dormant** (all display uses `org.default_timezone`). v2 = honor `office.timezone` where set. **No booking-model change, no re-migration.** *(Reconciles §0 D5 "no per-office tz in v1" with §10 "leave the nullable seam" — the column is present but behavior-free in v1.)*
- All instants are `tstzrange` UTC, so rendering in any tz — one now, per-office later — is pure presentation; DST correct by construction.

**Corners not cut (so v2 stays additive):**
- **Don't** bake display tz into the frontend as a global constant — resolve it through `room → floor → office → org` even while uniform. That single indirection makes v2 additive.
- **Business-hours/horizon math (OQ#7)** computed tz-relative to the resolved office/org tz, not the server's.
- **Never store local wall-clock** "to be helpful" — the classic multi-tz rewrite trap.

---

## 5a. Availability grid & booking-form behavior (design locks — Priya, accepted 2026-08-06)

These are app-layer rules on top of the model; none touch §2. They pin the availability grid (F4) and booking form (F6) so Nemo and Sam agree on the contract.

- **Grid window = 08:00–20:00** in the org display tz — the rendered timeline is 48 fifteen-minute cells/day, not a full 24h. **Not a hard booking constraint at the DB** (bookings outside the window remain physically valid `tstzrange`s); it's a render + default-scope rule. If OQ#7 later wants true off-hours blocking, that's an additive policy `CHECK`/validation — flagged, not built.
- **Grey-out passed slots** — cells whose `upper(during) <= now()` (tz-resolved) render disabled/non-selectable. Server **also** rejects a booking whose start is in the past (don't trust the client) → 422. Freshness (NF4) already live-queries, so "now" is honest per load.
- **Book exactly the filtered time window** — the booking defaults to the contiguous block the user filtered (F5 time window), snapped to the 15-min grid (D1). **Drag-select** an arbitrary sub-block on the grid = **P1**; v1 books the filtered window as-is. Keeps the money path ≤2 clicks.
- **Attendees > capacity = soft warning** (see §2 API contract) — non-blocking `warnings[]`; never a 4xx on capacity alone.

---

## 6. Stack & deployment shape (recommendation)

**Concurrency verdict commits us to Postgres** (EXCLUDE + range types are PG-specific). Right default anyway. Stack is my call per §10; the one hard constraint I raise is **Postgres** — a mandate for MySQL/other degrades the primary guarantee to the fragile app-level fallback.

| Layer | Pick | One-line why |
|---|---|---|
| **DB** | **PostgreSQL 15+** | Non-negotiable per §2; natural fit for the relational hierarchy. |
| **Backend** | **Python + Django + DRF** | Native `ExclusionConstraint` (exact §2 mechanism); pluggable auth backends + **`django-auth-ldap`** = the §4 LDAP/AD seam free; Django admin gives office/floor/room CRUD (Persona B) nearly free; batteries-included RBAC/sessions/migrations. One boring monolith. |
| **Frontend** | **React (Vite) SPA** over a DRF JSON API | The office/floor picker + 15-min availability grid *is the product* (≤2 clicks, phone-in-hallway, interactive grid selection) — genuinely SPA-shaped. |
| **Deploy** | **Single container + managed Postgres** (one region) | Internal tool, modest scale ⇒ monolith + one DB. No queue/cache/microservices in v1. |

**Alternative, not picked v1:** Node/TS (NestJS + Prisma) — Prisma lacks first-class exclusion-constraint support (raw SQL migration needed anyway) and you rebuild admin CRUD + auth plumbing Django ships (`passport-ldapauth` vs `django-auth-ldap`). Acceptable second choice for a TS shop — **§2 verdict and §4 seam are framework-independent.** Django-templates+HTMX is the lighter one-deployable option.

**Shape summary:** standalone internal web app → monolith, single Postgres, managed hosting, HTTPS-only, sessions in secure cookies. No federation, no tenancy isolation, no offline/mobile-native.

---

## 7. Security posture (secure by design, v1)

- **Authn:** local passwords hashed argon2id/bcrypt (v1); LDAP/AD via bind (v2, no stored directory password); sessions expire + explicit logout (NF2).
- **Authz:** role check server-side on every admin route/action (403), not UI-gated. Ownership check on cancel (F7). Office-scoped admin is the natural extension (OQ#9).
- **Input validation:** 15-min grid guard + policy limits (F8) server-side; parameterized queries / ORM; facilities a managed enum (not free text).
- **Data integrity:** soft-delete + **block-delete of non-empty office/floor** (no orphaned bookings); audit fields on booking seed NF6 audit log (P1).
- **Transport:** HTTPS only; secure/httpOnly/SameSite cookies.
- **Threat model (lightweight):** (a) booking-hoarding/DoS → policy limits + optional per-user cap (OQ#6); (b) IDOR on cancel → ownership checks; (c) priv-esc → server-side RBAC; (d) LDAP injection on bind (v2) → escape DN/filter, prefer service-account search-then-bind.

---

## 8. Risks, assumptions & open questions

**Blocking gate (needs Screwgoth):**
- ⚠️ **Auth (D2 detail):** AD vs generic LDAP, bind strategy, AD-group→role mapping. v1 local password + seam ships regardless.

**Resolved by §0 lock:** booking model (D1 fixed grid), auth direction (D2 LDAP), locations (D3 multi-office MVP), scope (D4), timezone (D5 single tz). Stack: Postgres flagged as the one hard constraint (else my call).

**Locked by 2026-08-06 handoff:** per-office admin scoping = **P1** (v1 = global admin; `office_id`-on-grant seam dormant in §4). Priya's 4 design defaults **accepted** → §5a (grid 08:00–20:00, grey-out passed slots, book exact filtered window / drag-select P1, attendees>capacity soft warning).

**Non-blocking (sane defaults):** OQ#2 scale (no pattern change), OQ#6 policy defaults (8h/30d/15-min/no-cap), OQ#7 business hours (08:00–20:00 render window is UX, not a DB constraint), reception workflow (Admin role covers it).

**Superseded assumptions:** old A10 "free time-range" → **D1 fixed 15-min grid.** Old "OIDC-ready" → **D2 LDAP/AD.** Old "single location" → **D3 multi-office.**

---

## 9. Rough sequencing (informs backlog; Sam owns the real plan; maps to issues #1–#8)

- **M0 Foundation:** Postgres schema incl. **Org→Office→Floor→Room** + the §2 EXCLUDE constraint (constraint *first*, with Quinn's race test) → auth (local-password adapter + §4 LDAP-ready seam) + RBAC → office/floor + room + facility CRUD (leverage Django admin; block-delete-non-empty).
- **M1 Core loop:** office-scoped availability grid (15-min) + filters → book (constraint-enforced, 409 on `23P01`, grid guard) → my-bookings + cancel (status flip).
- **M2 (P1):** admin all-bookings console, edit booking, email/`.ics`, audit log.
- **M3 (v2/v3, D4):** LDAP/AD adapter (seam ready), per-office timezone (column ready), recurring, approvals, no-show, calendar sync, analytics.

**Build the constraint + its race test before any booking UI.** It's the linchpin; everything downstream assumes it holds.

---
*Final at `~/artifacts/prds/meeting-room-booking/architecture/ARCHITECTURE.md`. PRD approved by Screwgoth 2026-08-06; §2 is the linchpin verdict, §3–§9 signed off and aligned to PRD §0 D1–D5 + the handoff locks. One non-blocking gate remains (LDAP bind detail, §4/§8) — v1 ships without it. Sam + Nemo unlock. Repo `screwgoth/meeting-room-booking` (issues #1–#8 live) — I created nothing. Diagrams on request.*
