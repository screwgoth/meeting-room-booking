import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import secureSession from '@fastify/secure-session';
import { ZodError } from 'zod';
import type { Config } from './config.js';
import type { Db } from './lib/db.js';
import { AppError } from './lib/errors.js';
import type { IdentityProvider } from './auth/types.js';
import { UserRepo } from './auth/userRepo.js';
import { registerAuthRoutes } from './auth/routes.js';
import { LocationRepo } from './locations/repo.js';
import { LocationService } from './locations/service.js';
import { registerLocationRoutes } from './locations/routes.js';
import { BookingRepo } from './bookings/repo.js';
import { BookingService } from './bookings/service.js';
import { registerBookingRoutes } from './bookings/routes.js';
import { AvailabilityRepo } from './availability/repo.js';
import { AvailabilityService } from './availability/service.js';
import { registerAvailabilityRoutes } from './availability/routes.js';

// Only the user id lives in the (encrypted) session cookie (§7).
declare module '@fastify/secure-session' {
  interface SessionData {
    userId: number;
  }
}

export interface ServerDeps {
  config: Config;
  db: Db;
  identityProvider: IdentityProvider;
}

/**
 * Wire the HTTP app: encrypted session cookie, one central error handler that
 * maps typed AppErrors / ZodErrors to status codes without leaking internals
 * (§7), and the feature route groups. Kept dependency-injected so tests can
 * build a server against an embedded Postgres.
 */
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const { config, db, identityProvider } = deps;
  const app = Fastify({ logger: false });

  await app.register(secureSession, {
    cookieName: 'session',
    secret: config.sessionSecret,
    salt: config.sessionSalt,
    cookie: {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
    },
  });

  // ---- Central error handler (§7 safe errors) ------------------------------
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof AppError) {
      return reply
        .code(err.status)
        .send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err instanceof ZodError) {
      return reply.code(422).send({
        error: {
          code: 'validation_error',
          message: 'Request validation failed',
          details: err.issues.map((i) => ({ path: i.path, message: i.message })),
        },
      });
    }
    // Fastify's own validation / body-parse errors carry a statusCode.
    if (typeof err.statusCode === 'number' && err.statusCode >= 400 && err.statusCode < 500) {
      return reply
        .code(err.statusCode)
        .send({ error: { code: 'bad_request', message: err.message } });
    }
    app.log.error(err);
    return reply
      .code(500)
      .send({ error: { code: 'internal_error', message: 'Internal server error' } });
  });

  // ---- Dependency graph ----------------------------------------------------
  const users = new UserRepo(db);
  const locationRepo = new LocationRepo(db);
  const locationService = new LocationService(locationRepo);
  const bookingRepo = new BookingRepo(db);
  const bookingService = new BookingService(bookingRepo, config);
  const availabilityRepo = new AvailabilityRepo(db);
  const availabilityService = new AvailabilityService(availabilityRepo, config);

  app.get('/api/health', async () => ({ status: 'ok' }));

  await registerAuthRoutes(app, { identityProvider, users });
  await registerLocationRoutes(app, { service: locationService, repo: locationRepo, users });
  await registerAvailabilityRoutes(app, { service: availabilityService, users });
  await registerBookingRoutes(app, { service: bookingService, users });

  return app;
}
