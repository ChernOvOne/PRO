# ── Build ────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl python3 make g++

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY prisma ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src/
RUN npm run build

# ── Production ───────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

RUN apk add --no-cache openssl curl

RUN addgroup -g 1001 -S nodejs && adduser -S hideyou -u 1001

COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

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
