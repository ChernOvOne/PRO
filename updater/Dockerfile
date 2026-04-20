FROM node:20-alpine

# git + docker-cli (for compose operations) + postgres16-client (matches pg16 server)
# + tar for backups + curl for GitHub/Telegram
# NOTE: must use postgresql16-client explicitly — default `postgresql-client`
# pulls pg17 on newer Alpine, which emits SET transaction_timeout=0 in dumps
# that pg16 server rejects.
RUN apk add --no-cache git docker-cli docker-cli-compose postgresql16-client \
    tar gzip bash curl ca-certificates

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY worker.js ./
COPY backup.sh restore.sh ./
RUN chmod +x backup.sh restore.sh

CMD ["node", "worker.js"]
