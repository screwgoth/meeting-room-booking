import { describe, it, expect } from 'vitest';
import { validateBookingWindow, type BookingPolicy } from '../src/bookings/grid.js';
import { ValidationError } from '../src/lib/errors.js';

const policy: BookingPolicy = { slotMinutes: 15, maxDurationMinutes: 480, horizonDays: 30 };
const now = new Date('2026-08-10T00:00:00Z');

describe('validateBookingWindow', () => {
  it('accepts an aligned, in-window booking', () => {
    const { start, end } = validateBookingWindow(
      '2026-08-11T09:00:00Z',
      '2026-08-11T10:00:00Z',
      policy,
      now,
    );
    expect(start.toISOString()).toBe('2026-08-11T09:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-11T10:00:00.000Z');
  });

  it('rejects a start off the 15-minute grid (→ 422)', () => {
    const err = () =>
      validateBookingWindow('2026-08-11T09:05:00Z', '2026-08-11T10:00:00Z', policy, now);
    expect(err).toThrow(ValidationError);
    expect(err).toThrow(/15-minute/);
  });

  it('rejects an end off the 15-minute grid', () => {
    expect(() =>
      validateBookingWindow('2026-08-11T09:00:00Z', '2026-08-11T10:07:00Z', policy, now),
    ).toThrow(ValidationError);
  });

  it('rejects end <= start', () => {
    expect(() =>
      validateBookingWindow('2026-08-11T09:00:00Z', '2026-08-11T09:00:00Z', policy, now),
    ).toThrow(/after start/);
  });

  it('rejects a start in the past', () => {
    expect(() =>
      validateBookingWindow('2026-08-09T09:00:00Z', '2026-08-09T10:00:00Z', policy, now),
    ).toThrow(/past/);
  });

  it('rejects a booking beyond the horizon', () => {
    expect(() =>
      validateBookingWindow('2026-09-20T09:00:00Z', '2026-09-20T10:00:00Z', policy, now),
    ).toThrow(/horizon/);
  });

  it('rejects a booking longer than the max duration', () => {
    expect(() =>
      validateBookingWindow('2026-08-11T08:00:00Z', '2026-08-11T17:00:00Z', policy, now),
    ).toThrow(/maximum duration/);
  });

  it('rejects non-ISO input', () => {
    expect(() => validateBookingWindow('not-a-date', '2026-08-11T10:00:00Z', policy, now)).toThrow(
      ValidationError,
    );
  });
});
