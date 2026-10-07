#!/bin/sh
set -e

# Container entrypoint shared by every app image (see the root Dockerfile).

# Run database migrations
echo "📦 Running database migrations..."
node ./scripts/migrate.js

# Start the SvelteKit app
echo "🚀 Starting SvelteKit server..."
exec node ./build/index.js
