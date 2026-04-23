FROM node:20-alpine

# git + docker-cli (for compose operations) + postgres16-client (matches pg16 server)
# + tar for backups + curl for GitHub/Telegram
# NOTE: must use postgresql16-client explicitly — default `postgresql-client`
# pulls pg17 on newer Alpine, which emits SET transaction_timeout=0 in dumps
# that pg16 server rejects.
RUN apk add --no-cache git docker-cli docker-cli-compose postgresql16-client \
    tar gzip bash curl ca-certificates

WORKDIR /app

ENV npm_config_fetch_retries=10 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=600000

COPY package.json ./
RUN for i in 1 2 3 4 5; do \
      npm install --omit=dev --legacy-peer-deps && break || \
      (echo "npm install attempt $i failed, retrying in 15s..." && sleep 15); \
    done

COPY worker.js ./
COPY backup.sh restore.sh ./
RUN chmod +x backup.sh restore.sh

CMD ["node", "worker.js"]
