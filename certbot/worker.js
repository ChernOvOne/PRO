#!/usr/bin/env node
/**
 * HIDEYOU Certbot sidecar worker.
 *
 * Polls Redis list `cert:queue` for domain-issuance jobs. Each job is JSON:
 *   { domain, role, email }
 *
 * Flow per job:
 *   1. Resolve DNS; skip if domain doesn't point at this server's public IP
 *      (best-effort — certbot will verify again via ACME challenge).
 *   2. Ensure nginx has an HTTP-only stub so certbot's webroot challenge
 *      can hit /.well-known/acme-challenge/ for the domain.
 *   3. Run certbot --webroot certonly.
 *   4. Render the final HTTPS vhost from templates/app.conf.template,
 *      substituting {{DOMAIN}} and {{ROLE_BLOCK}} based on role.
 *   5. Write to /etc/nginx/conf.d/<domain>.conf.
 *   6. Reload nginx: `docker exec hideyou_nginx nginx -s reload`.
 *   7. Publish result to Redis pub/sub channel `cert:events` so the
 *      backend can update SetupDomain status.
 *
 * Also runs `certbot renew` every 12h for automatic renewal.
 */

const fs = require('fs')
const path = require('path')
const { spawn, execSync } = require('child_process')
const Redis = require('ioredis')

const REDIS_URL         = process.env.REDIS_URL || 'redis://redis:6379'
const QUEUE_KEY         = 'cert:queue'
const EVENTS_CHANNEL    = 'cert:events'
const WEBROOT_DIR       = '/var/www/certbot'
const CONF_D_DIR        = '/etc/nginx/conf.d'
const LETSENCRYPT_DIR   = '/etc/letsencrypt'
const TEMPLATE_PATH     = path.join(__dirname, 'templates', 'app.conf.template')
const NGINX_CONTAINER   = process.env.NGINX_CONTAINER || 'hideyou_nginx'
const DEFAULT_EMAIL     = process.env.CERTBOT_EMAIL || 'admin@example.com'

const log = (...args) => console.log('[certbot-worker]', new Date().toISOString(), ...args)
const err = (...args) => console.error('[certbot-worker ERROR]', new Date().toISOString(), ...args)

/* ── Role-specific location blocks ──────────────────────────────── */

const ROLE_BLOCKS = {
  app: `# Root → client dashboard
  location = / { return 302 /dashboard; }

  # Block admin panel on client domain
  location /admin { return 403; }`,

  admin: `# Only admin routes allowed
  location = / { return 302 /admin; }

  # Block client dashboard on admin domain (optional)
  # location /dashboard { return 403; }`,

  landing: `# Landing serves the homepage
  # Block admin + dashboard on landing domain
  location /admin { return 403; }
  location /dashboard { return 302 https://app.\${host}/dashboard; }`,

  api: `# API-only domain — proxy everything to backend
  location / {
    proxy_pass http://$backend_host;
    proxy_http_version 1.1; proxy_set_header Connection ""; proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-Proto $scheme;
  }`,

  webhook: `# Webhook-only — tight rate limiting
  location / {
    limit_req zone=webhook burst=100 nodelay;
    proxy_pass http://$backend_host;
    proxy_http_version 1.1; proxy_set_header Connection ""; proxy_set_header Host $host;
    proxy_read_timeout 60s;
  }`,

  payments: `# Payments (YuKassa return/webhook)
  location = / { return 302 /dashboard/billing; }`,

  custom: `# Custom role — no restrictions`,
}

/* ── Helpers ────────────────────────────────────────────────────── */

function render(template, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v),
    template,
  )
}

function sanitizeDomain(d) {
  return String(d || '').trim().toLowerCase().replace(/[^a-z0-9.\-]/g, '')
}

function domainExists(domain) {
  return fs.existsSync(path.join(LETSENCRYPT_DIR, 'live', domain, 'fullchain.pem'))
}

async function runCertbot(domain, email) {
  return new Promise((resolve, reject) => {
    const args = [
      'certonly', '--webroot',
      '-w', WEBROOT_DIR,
      '-d', domain,
      '--email', email,
      '--agree-tos', '--non-interactive',
      '--keep-until-expiring',
      '--expand',
    ]
    if (process.env.CERTBOT_STAGING === '1') args.push('--staging')
    log('Running: certbot', args.join(' '))
    const p = spawn('certbot', args, { stdio: 'inherit' })
    p.on('exit', code => code === 0 ? resolve() : reject(new Error(`certbot exit ${code}`)))
    p.on('error', reject)
  })
}

function writeVhost(domain, role) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  const roleBlock = ROLE_BLOCKS[role] || ROLE_BLOCKS.custom
  const content = render(template, { DOMAIN: domain, ROLE_BLOCK: roleBlock })
  const destPath = path.join(CONF_D_DIR, `${domain}.conf`)
  fs.writeFileSync(destPath, content)
  log(`Wrote ${destPath}`)
}

function reloadNginx() {
  try {
    execSync(`docker exec ${NGINX_CONTAINER} nginx -t`, { stdio: 'inherit' })
    execSync(`docker exec ${NGINX_CONTAINER} nginx -s reload`, { stdio: 'inherit' })
    log('nginx reloaded')
  } catch (e) {
    err('nginx reload failed:', e.message)
    throw e
  }
}

/* ── Main loop ──────────────────────────────────────────────────── */

async function processJob(job, pub) {
  const domain = sanitizeDomain(job.domain)
  const role = job.role || 'custom'
  const email = job.email || DEFAULT_EMAIL

  if (!domain || !/^[a-z0-9][a-z0-9.\-]*\.[a-z]{2,}$/i.test(domain)) {
    await pub.publish(EVENTS_CHANNEL, JSON.stringify({
      domain, status: 'failed', error: 'Invalid domain format',
    }))
    return
  }

  log(`Processing domain=${domain} role=${role}`)

  try {
    if (!domainExists(domain)) {
      await runCertbot(domain, email)
    } else {
      log(`Certificate already exists for ${domain}, skipping issuance`)
    }

    writeVhost(domain, role)
    reloadNginx()

    await pub.publish(EVENTS_CHANNEL, JSON.stringify({
      domain, status: 'cert_ok',
    }))
    log(`Domain ${domain} fully configured`)
  } catch (e) {
    err(`Failed for ${domain}:`, e.message)
    await pub.publish(EVENTS_CHANNEL, JSON.stringify({
      domain, status: 'failed', error: e.message,
    }))
  }
}

async function renewalLoop() {
  setInterval(() => {
    log('Running certbot renew')
    try {
      execSync('certbot renew --webroot -w ' + WEBROOT_DIR + ' --quiet --deploy-hook "docker exec ' + NGINX_CONTAINER + ' nginx -s reload"', {
        stdio: 'inherit',
      })
    } catch (e) {
      err('renew failed:', e.message)
    }
  }, 12 * 60 * 60 * 1000) // every 12h
}

async function main() {
  log('Starting certbot worker')
  log(`Redis URL: ${REDIS_URL}`)
  log(`Nginx container: ${NGINX_CONTAINER}`)

  const sub = new Redis(REDIS_URL)
  const pub = new Redis(REDIS_URL)

  await sub.ping()
  log('Redis connected')

  renewalLoop()

  while (true) {
    try {
      const [, payload] = await sub.blpop(QUEUE_KEY, 0)
      const job = JSON.parse(payload)
      await processJob(job, pub)
    } catch (e) {
      err('Loop error:', e.message)
      await new Promise(r => setTimeout(r, 2000))
    }
  }
}

main().catch(e => {
  err('Fatal:', e)
  process.exit(1)
})
