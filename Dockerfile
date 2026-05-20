# ─── Build Stage ─────────────────────────────────────
FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/backend/package.json packages/backend/tsconfig.json ./packages/backend/
COPY packages/admin/package.json packages/admin/tsconfig.json packages/admin/vite.config.ts ./packages/admin/
COPY packages/checkout/package.json packages/checkout/tsconfig.json packages/checkout/vite.config.ts ./packages/checkout/
COPY packages/sdk/package.json packages/sdk/tsconfig.json ./packages/sdk/

RUN pnpm install --frozen-lockfile

COPY packages/ packages/

# Build SDK first (it's a dependency), then everything else.
RUN pnpm run build

# Create a standalone deployment with resolved (non-symlinked) node_modules.
RUN pnpm deploy --filter=@anybill/backend --prod --legacy /app/deploy

# ─── Production Stage ────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache caddy

WORKDIR /app

# Copy the standalone backend with all production dependencies.
COPY --from=builder /app/deploy/dist ./dist
COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/deploy/package.json ./package.json

# Copy built SPAs.
COPY --from=builder /app/packages/admin/dist ./public/admin
COPY --from=builder /app/packages/checkout/dist ./public/checkout

# Copy Caddy config and entrypoint.
COPY Caddyfile /etc/caddy/Caddyfile
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/anybill.db
ENV DB_DIR=/data

EXPOSE 3000

VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
