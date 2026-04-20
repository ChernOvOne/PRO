FROM node:20-alpine

# git + docker-cli (for compose operations) + postgres-client (for pg_dump/restore)
# + tar for backups + curl for GitHub/Telegram
RUN apk add --no-cache git docker-cli docker-cli-compose postgresql-client \
    tar gzip bash curl ca-certificates

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY worker.js ./
COPY backup.sh restore.sh ./
RUN chmod +x backup.sh restore.sh

CMD ["node", "worker.js"]
