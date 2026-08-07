-- 001_init.sql — Meeting Room Booking foundational schema (issue #2)
-- Maps to ARCHITECTURE.md §2 (concurrency) + §3 (data model).
-- Applied atomically by scripts/migrate.ts inside a single transaction.

-- btree_gist lets `room_id WITH =` share a GiST index with the range operator (§2).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------------
-- Location hierarchy: Org -> Office -> Floor -> Room  (D3, §3)
-- ---------------------------------------------------------------------------
CREATE TABLE org (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name             TEXT   NOT NULL,
  default_timezone TEXT   NOT NULL DEFAULT 'UTC',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE office (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  org_id     BIGINT NOT NULL REFERENCES org(id),
  name       TEXT   NOT NULL,
  -- D5: dormant nullable seam. NULL => fall back to org.default_timezone in v1.
  -- Lights up in v2 with NO migration. Carries no behavior in v1.
  timezone   TEXT   NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT office_name_not_blank CHECK (btrim(name) <> '')
);
CREATE INDEX office_org_id_idx ON office(org_id);

CREATE TABLE floor (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  office_id  BIGINT NOT NULL REFERENCES office(id),
  name       TEXT   NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT floor_name_not_blank CHECK (btrim(name) <> '')
);
CREATE INDEX floor_office_id_idx ON floor(office_id);

CREATE TABLE room (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  floor_id   BIGINT NOT NULL REFERENCES floor(id),
  name       TEXT   NOT NULL,
  capacity   INT    NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT room_capacity_positive CHECK (capacity > 0)
);
CREATE INDEX room_floor_id_idx ON room(floor_id);

-- ---------------------------------------------------------------------------
-- Facilities: managed tag set, referenced by rooms (not free text) — #2/#4
-- ---------------------------------------------------------------------------
CREATE TABLE facility (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT   NOT NULL UNIQUE,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT facility_name_not_blank CHECK (btrim(name) <> '')
);

CREATE TABLE room_facility (
  room_id     BIGINT NOT NULL REFERENCES room(id) ON DELETE CASCADE,
  facility_id BIGINT NOT NULL REFERENCES facility(id) ON DELETE CASCADE,
  PRIMARY KEY (room_id, facility_id)
);
CREATE INDEX room_facility_facility_idx ON room_facility(facility_id);

-- ---------------------------------------------------------------------------
-- Users & roles (#1). Auth seam per §4: auth_source + directory_id + nullable
-- password_hash so an LDAP/AD adapter drops in with no migration.
-- ---------------------------------------------------------------------------
CREATE TABLE app_user (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NULL,
  display_name  TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'EMPLOYEE',
  password_hash TEXT NULL,               -- NULL for directory-backed users (v2)
  auth_source   TEXT NOT NULL DEFAULT 'LOCAL',
  directory_id  TEXT NULL,               -- AD objectGUID / DN (v2)
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_user_role_chk CHECK (role IN ('EMPLOYEE', 'ADMIN')),
  CONSTRAINT app_user_auth_source_chk CHECK (auth_source IN ('LOCAL', 'LDAP')),
  -- LOCAL users must have a password hash; directory users must not.
  CONSTRAINT app_user_local_has_hash CHECK (
    (auth_source = 'LOCAL' AND password_hash IS NOT NULL)
    OR (auth_source = 'LDAP' AND password_hash IS NULL)
  )
);
-- One directory identity per source (v2). Partial: local users have NULL directory_id.
CREATE UNIQUE INDEX app_user_directory_uq
  ON app_user(auth_source, directory_id)
  WHERE directory_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Bookings (#7). The invariant lives here — §2 exclusion constraint.
-- during is half-open [start, end) UTC, grid-aligned to 15 min (D1).
-- ---------------------------------------------------------------------------
CREATE TABLE booking (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  room_id        BIGINT NOT NULL REFERENCES room(id),
  user_id        BIGINT NOT NULL REFERENCES app_user(id),
  during         TSTZRANGE NOT NULL,
  title          TEXT NOT NULL,
  attendee_count INT NULL,
  status         TEXT NOT NULL DEFAULT 'confirmed',
  cancelled_by   BIGINT NULL REFERENCES app_user(id),
  cancel_reason  TEXT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT booking_status_chk CHECK (status IN ('confirmed', 'cancelled')),
  CONSTRAINT booking_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT booking_attendees_positive CHECK (attendee_count IS NULL OR attendee_count > 0),
  -- Half-open, non-empty, lower-bounded, upper-bounded range.
  CONSTRAINT booking_range_valid CHECK (
    NOT isempty(during)
    AND lower_inc(during) AND NOT upper_inc(during)
    AND lower(during) IS NOT NULL AND upper(during) IS NOT NULL
    AND upper(during) > lower(during)
  ),
  -- Defense-in-depth for the D1 grid guard (app validates first; DB is the floor).
  CONSTRAINT booking_grid_aligned CHECK (
    EXTRACT(EPOCH FROM lower(during))::bigint % 900 = 0
    AND EXTRACT(EPOCH FROM upper(during))::bigint % 900 = 0
  )
);

-- ⭐ The product invariant (§2): no two CONFIRMED bookings overlap for a room.
-- Partial exclusion so cancelled bookings free the slot (F7).
ALTER TABLE booking ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (room_id WITH =, during WITH &&)
  WHERE (status = 'confirmed');

-- "My bookings" lookup (#8).
CREATE INDEX booking_user_lower_idx ON booking(user_id, lower(during));
