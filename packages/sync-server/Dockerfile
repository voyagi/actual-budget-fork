###################################################
# Dockerfile for the Enable Banking fork of Actual Budget
# Build context: monorepo root
# Multi-stage build: builder compiles, runner serves
###################################################

# --- Builder stage ---
FROM node:22-bookworm-slim AS builder

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY . .

RUN corepack enable && corepack prepare yarn@4.10.3 --activate

RUN yarn install --immutable

RUN yarn workspace @actual-app/sync-server build

RUN yarn workspace loot-core build:browser

RUN yarn workspace @actual-app/web build:browser

# --- Runner stage ---
FROM node:22-bookworm-slim

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN groupadd -r actual && useradd -r -g actual -m actual

WORKDIR /app

COPY --from=builder /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY --from=builder /app/.yarn ./.yarn
COPY --from=builder /app/.pnp.cjs /app/.pnp.loader.mjs ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/sync-server/build ./packages/sync-server/build
COPY --from=builder /app/packages/sync-server/package.json ./packages/sync-server/
COPY --from=builder /app/packages/sync-server/node_modules ./packages/sync-server/node_modules
COPY --from=builder /app/packages/sync-server/migrations ./packages/sync-server/migrations
COPY --from=builder /app/packages/sync-server/src/app-enablebanking/link.html ./packages/sync-server/src/app-enablebanking/
COPY --from=builder /app/packages/desktop-client/build ./packages/desktop-client/build
COPY --from=builder /app/packages/desktop-client/package.json ./packages/desktop-client/
COPY --from=builder /app/packages/loot-core/lib-dist ./packages/loot-core/lib-dist
COPY --from=builder /app/packages/loot-core/package.json ./packages/loot-core/

ENV ACTUAL_DATA_DIR=/data

RUN mkdir -p /data && chown actual:actual /data

USER actual

EXPOSE 5006

CMD ["node", "packages/sync-server/build/app.js"]
