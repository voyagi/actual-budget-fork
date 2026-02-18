###################################################
# Dockerfile for the Enable Banking fork of Actual Budget
# Build context: monorepo root
# Builds sync-server + desktop-client and serves via Express
###################################################

FROM node:22-bookworm-slim

# Install system dependencies needed for native modules (bcrypt, better-sqlite3)
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the full monorepo (build context is repo root)
# .dockerignore at repo root excludes node_modules and caches
COPY . .

# Enable corepack and activate the pinned Yarn version from yarnPath
RUN corepack enable && corepack prepare yarn@4.10.3 --activate

# Install all workspace dependencies
RUN yarn install --immutable

# Build the sync-server (TypeScript -> packages/sync-server/build/)
RUN yarn workspace @actual-app/sync-server build

# Build loot-core browser backend (produces kcab worker files in desktop-client/public/kcab/)
# Must run before desktop-client build since the web build references the worker hash
RUN yarn workspace loot-core build:browser

# Build the desktop-client static files (packages/desktop-client/build/)
# build:browser sets IS_GENERIC_BROWSER=1 (resolves .browser.js for window.Actual)
# and extracts REACT_APP_BACKEND_WORKER_HASH from the kcab worker filename
RUN yarn workspace @actual-app/web build:browser

# Data directory for Actual user files and server files
ENV ACTUAL_DATA_DIR=/data

EXPOSE 5006

# Run migrations then start the server
# From /app root: packages/sync-server/build/app.js
CMD ["node", "packages/sync-server/build/app.js"]
