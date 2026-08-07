import { z } from 'zod';

/**
 * Central, validated configuration. Secrets and tunables come from the
 * environment only (never hardcoded) — see AGENTS.md "secrets from config/env".
 *
 * We read process.env lazily via loadConfig() so tests can inject overrides
 * before the app boots.
 */
const ConfigSchema = z.object({
  databaseUrl: z.string().min(1, 'DATABASE_URL is required'),
  port: z.coerce.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  sessionSecret: z
    .string()
    .min(32, 'SESSION_SECRET must be at least 32 characters'),
  sessionSalt: z.string().min(1),
  cookieSecure: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(false),
  orgDisplayTz: z.string().default('UTC'),
  slotMinutes: z.coerce.number().int().positive().default(15),
  maxDurationMinutes: z.coerce.number().int().positive().default(480),
  horizonDays: z.coerce.number().int().positive().default(30),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse({
    databaseUrl: env.DATABASE_URL,
    port: env.PORT,
    host: env.HOST,
    sessionSecret: env.SESSION_SECRET,
    sessionSalt: env.SESSION_SALT,
    cookieSecure: env.COOKIE_SECURE,
    orgDisplayTz: env.ORG_DISPLAY_TZ,
    slotMinutes: env.BOOKING_SLOT_MINUTES,
    maxDurationMinutes: env.BOOKING_MAX_DURATION_MINUTES,
    horizonDays: env.BOOKING_HORIZON_DAYS,
  });
}
