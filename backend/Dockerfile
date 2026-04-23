# ── Build ────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

# Resilience against flaky network (binaries.prisma.sh ECONNRESET is the
# usual culprit — npm retries plus an outer bash retry loop.
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

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build
# Copy non-TS seed assets (SQL templates) next to compiled JS so __dirname works
RUN cp -r src/services/seed-data dist/services/seed-data

# ── Production ───────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache openssl curl

RUN addgroup -g 1001 -S nodejs && adduser -S hideyou -u 1001

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000

COPY package*.json ./
RUN for i in 1 2 3 4 5; do \
      npm install --omit=dev --legacy-peer-deps && break || \
      (echo "npm install attempt $i failed, retrying in 15s..." && sleep 15); \
    done

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma
COPY prisma ./prisma/

RUN mkdir -p /app/data /app/uploads && chown -R hideyou:nodejs /app

USER hideyou
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
