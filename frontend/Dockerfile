FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache libc6-compat

# Resilience against flaky network — retry npm on transient ECONNRESET.
ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000

COPY package*.json ./
RUN for i in 1 2 3 4 5; do \
      npm install --legacy-peer-deps && break || \
      (echo "npm install attempt $i failed, retrying in 15s..." && sleep 15); \
    done

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV INTERNAL_API_URL=http://backend:4000

# Build-time args — NEXT_PUBLIC_* запекаются в бандл при сборке
ARG NEXT_PUBLIC_TG_BOT_NAME
ARG NEXT_PUBLIC_API_URL=/api
ARG NEXT_PUBLIC_MAPTILER_KEY
ARG NEXT_PUBLIC_YANDEX_KEY
ENV NEXT_PUBLIC_TG_BOT_NAME=${NEXT_PUBLIC_TG_BOT_NAME}
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_MAPTILER_KEY=${NEXT_PUBLIC_MAPTILER_KEY}
ENV NEXT_PUBLIC_YANDEX_KEY=${NEXT_PUBLIC_YANDEX_KEY}

RUN npm run build

# ── Production ────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache libc6-compat curl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD curl -fL http://localhost:3000 || exit 1

CMD ["node", "server.js"]
