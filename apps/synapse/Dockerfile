# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.23.3
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="SvelteKit"

# SvelteKit app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install packages needed to build node modules. ca-certificates is required for the
# bundled sentry-cli binary (used by the Sentry vite plugin) to verify TLS when uploading
# source maps — it doesn't share Node's bundled cert store.
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y build-essential node-gyp pkg-config python-is-python3 ca-certificates

# pnpm via corepack, pinned by the root package.json's packageManager field
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# The build context is the monorepo root (see .github/workflows/fly-deploy.yml), so the
# workspace lockfile and packages/ are visible. Fetch from the lockfile alone first so the
# dependency layer stays cached across source-only changes. NODE_ENV=production
# (set in base) would otherwise make pnpm skip the devDependencies the build needs.
WORKDIR /repo
COPY .npmrc package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod=false

# Copy the workspace, then install only this app and the workspace packages it uses
COPY . .
RUN pnpm install --offline --frozen-lockfile --prod=false --filter synapse...

WORKDIR /repo/apps/synapse

# Build application. SENTRY_AUTH_TOKEN is an optional BuildKit secret (passed via
# `fly deploy --build-secret`) that lets the Sentry vite plugin upload source maps for
# readable production stack traces; the build succeeds without it, just skipping the upload.
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
	SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN 2>/dev/null || true)" pnpm run build

# Strip source maps from server bundle (adapter-node hardcodes sourcemap: true)
RUN find build -name "*.map" -delete

# Write a standalone production node_modules for the runtime image (resolves workspace:*)
RUN pnpm --filter synapse deploy --prod --legacy /prod


# Final stage for app image
FROM base

# Install sqlite3 CLI for database backups
RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y sqlite3 && \
    rm -rf /var/lib/apt/lists/*

# Copy built application
COPY --from=build /repo/apps/synapse/build /app/build
COPY --from=build /prod/node_modules /app/node_modules
COPY --from=build /prod/package.json /app

# Copy migrations and the standalone migration runner (uses drizzle-orm, not the
# drizzle-kit CLI, so drizzle-kit stays a devDependency and is left out of /prod)
COPY --from=build /repo/apps/synapse/src/lib/server/db/migrations /app/src/lib/server/db/migrations
COPY --from=build /repo/scripts/migrate.js /app/scripts/migrate.js

# Setup sqlite3 on a separate volume
RUN mkdir -p /data
VOLUME /data

# Copy and set permissions for startup script
COPY apps/synapse/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
ENV DATABASE_URL="/data/synapse.db"
# Fly's proxy is the TCP peer for every request, so without this adapter-node's
# getClientAddress() returns the proxy IP and the auth-form rate limiters share one
# global bucket. adapter-node throws if the header is missing (fails closed).
ENV ADDRESS_HEADER="fly-client-ip"
# Not a secret (already public in Sentry's client SDK bundle); safe to bake in.
ENV SENTRY_DSN="https://0941b6e2d9801402928ec265ba858ff9@o4510809399492608.ingest.us.sentry.io/4511970268020736"
CMD [ "/app/start.sh" ]
