FROM node:20-alpine

# Install certbot + docker CLI (for nginx reload via docker exec)
RUN apk add --no-cache certbot certbot-nginx openssl docker-cli bash curl

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY worker.js ./
COPY templates ./templates

VOLUME ["/etc/letsencrypt", "/var/www/certbot", "/etc/nginx/conf.d"]

CMD ["node", "worker.js"]
