# syntax=docker/dockerfile:1
# Multi-stage: build the SPA, then run the Fastify API which also serves the SPA
# (single-container deploy). The DB is a separate compose service.

# ---- Stage 1: build the frontend SPA --------------------------------------
FROM node:20-slim AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
# Live backend (same origin in the container) — never the mock layer.
ENV VITE_USE_MOCKS=false
RUN npm run build

# ---- Stage 2: API + static SPA runtime ------------------------------------
FROM node:20-slim AS app
WORKDIR /app
ENV NODE_ENV=production
# argon2 may compile a native addon — provide a toolchain just in case.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# Runtime deps only (skips the heavy embedded-postgres dev dependency).
RUN npm ci --omit=dev && npm cache clean --force
# tsx runs the TS entrypoint + migrate/seed scripts without a separate build.
RUN npm install -g tsx@4

COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
COPY migrations ./migrations
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh
COPY --from=frontend /fe/dist ./frontend/dist

ENV STATIC_DIR=/app/frontend/dist \
    PORT=3000 \
    HOST=0.0.0.0
EXPOSE 3000
CMD ["./entrypoint.sh"]
