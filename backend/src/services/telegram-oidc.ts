/**
 * Telegram OIDC login verifier — validates id_token JWTs issued by
 * oauth.telegram.org against Telegram's remote JWKS.
 *
 * Spec:            https://core.telegram.org/bots/telegram-login
 * Token endpoint:  POST https://oauth.telegram.org/token
 * JWKS endpoint:   GET  https://oauth.telegram.org/.well-known/jwks.json
 *
 * The JS library (telegram-login.js) returns the id_token directly to the
 * browser after the user approves the popup. The browser forwards it to our
 * /api/auth/telegram-oidc endpoint; we verify the signature + claims here.
 *
 * Implementation note: uses native Node crypto (Node 16+ supports JWK as a
 * `createPublicKey` source) so we don't add a jose/jwks-rsa runtime dep.
 */

import { createPublicKey, createVerify, timingSafeEqual, KeyObject } from 'crypto'
import { config } from '../config'
import { logger } from '../utils/logger'

const ISSUER    = 'https://oauth.telegram.org'
const JWKS_URL  = 'https://oauth.telegram.org/.well-known/jwks.json'
const CACHE_TTL = 10 * 60 * 1000  // 10 min — Telegram rotates keys infrequently

export interface TelegramIdTokenClaims {
  iss:   string
  aud:   string | string[]
  sub:   string
  iat:   number
  exp:   number
  id?:   number
  name?: string
  preferred_username?: string
  picture?: string
  phone_number?: string
  nonce?: string
}

interface JWK {
  kid?: string
  kty: string
  alg?: string
  use?: string
  n?:   string
  e?:   string
}

interface JWKS {
  keys: JWK[]
}

// ── JWKS cache ────────────────────────────────────────────────────────────

let jwksCache: { fetchedAt: number; keys: Map<string, KeyObject> } | null = null

async function getSigningKey(kid: string | undefined): Promise<KeyObject> {
  const now = Date.now()
  if (!jwksCache || now - jwksCache.fetchedAt > CACHE_TTL) {
    await refreshJwks()
  }
  // Try cached first, then force-refresh once (handles key rotation between requests)
  if (kid && jwksCache?.keys.has(kid)) return jwksCache.keys.get(kid)!
  if (!kid && jwksCache && jwksCache.keys.size === 1) {
    return jwksCache.keys.values().next().value!
  }
  // Retry with fresh JWKS
  await refreshJwks()
  if (kid && jwksCache?.keys.has(kid)) return jwksCache.keys.get(kid)!
  if (!kid && jwksCache && jwksCache.keys.size === 1) {
    return jwksCache.keys.values().next().value!
  }
  throw new Error(`Signing key not found (kid=${kid || '<missing>'})`)
}

async function refreshJwks(): Promise<void> {
  const res = await fetch(JWKS_URL, { headers: { accept: 'application/json' } })
  if (!res.ok) throw new Error(`Failed to fetch Telegram JWKS (${res.status})`)
  const body = (await res.json()) as JWKS
  if (!body?.keys?.length) throw new Error('Telegram JWKS response has no keys')

  const map = new Map<string, KeyObject>()
  for (const jwk of body.keys) {
    if (jwk.kty !== 'RSA' || !jwk.n || !jwk.e) continue
    try {
      const keyObj = createPublicKey({ key: jwk as any, format: 'jwk' })
      map.set(jwk.kid || '__default__', keyObj)
    } catch (e: any) {
      logger.warn(`[telegram-oidc] Failed to import JWK ${jwk.kid}: ${e.message}`)
    }
  }
  if (map.size === 0) throw new Error('No usable RSA keys in Telegram JWKS')
  jwksCache = { fetchedAt: Date.now(), keys: map }
  logger.info(`[telegram-oidc] JWKS refreshed — ${map.size} key(s)`)
}

// ── JWT decoding + verification ──────────────────────────────────────────

function base64UrlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4))
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

/**
 * Verify an id_token issued by oauth.telegram.org. Throws on any failure
 * (signature, issuer, audience, expiration); returns the claims on success.
 *
 * @param idToken JWT string from Telegram.Login callback
 * @param expectedNonce optional nonce that must match the one supplied at init
 */
export async function verifyTelegramIdToken(
  idToken: string,
  expectedNonce?: string,
): Promise<TelegramIdTokenClaims> {
  if (!config.telegram.loginOidcEnabled) {
    throw new Error('Telegram OIDC login is not configured on this server')
  }

  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Malformed JWT — expected 3 segments')

  const [headerB64, payloadB64, signatureB64] = parts

  let header: any
  let payload: TelegramIdTokenClaims
  try {
    header  = JSON.parse(base64UrlDecode(headerB64).toString('utf8'))
    payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'))
  } catch {
    throw new Error('Malformed JWT — header or payload not JSON')
  }

  if (header.alg !== 'RS256') {
    throw new Error(`Unsupported JWT alg: ${header.alg} (expected RS256)`)
  }

  // Verify signature against JWKS
  const key = await getSigningKey(header.kid)
  const signedData = Buffer.from(`${headerB64}.${payloadB64}`)
  const signature  = base64UrlDecode(signatureB64)
  const verifier = createVerify('RSA-SHA256')
  verifier.update(signedData)
  verifier.end()
  if (!verifier.verify(key, signature)) {
    throw new Error('JWT signature verification failed')
  }

  // Claim checks
  const now = Math.floor(Date.now() / 1000)
  if (payload.iss !== ISSUER) {
    throw new Error(`Unexpected issuer: ${payload.iss}`)
  }
  const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud
  if (aud !== config.telegram.loginClientId) {
    throw new Error(`Audience mismatch: got ${aud}`)
  }
  if (typeof payload.exp !== 'number' || payload.exp < now - 60) {
    throw new Error('Token expired')
  }
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) {
    throw new Error('Token iat in the future — clock skew?')
  }

  if (expectedNonce) {
    if (!payload.nonce || !nonceEquals(payload.nonce, expectedNonce)) {
      throw new Error('Nonce mismatch — possible replay attack')
    }
  }

  return payload
}

function nonceEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// ── Optional: server-side code exchange (for redirect flow) ──────────────

/**
 * Exchange an authorization code for tokens via the /token endpoint.
 * Only used by server-side redirect flows — the JS popup hands id_token
 * directly to the browser, no exchange needed.
 */
export async function exchangeCodeForTokens(params: {
  code:         string
  redirectUri:  string
  codeVerifier: string
}): Promise<{ id_token: string; access_token: string; expires_in: number }> {
  if (!config.telegram.loginOidcEnabled) {
    throw new Error('Telegram OIDC login is not configured on this server')
  }
  if (!config.telegram.loginClientSecret) {
    throw new Error('TELEGRAM_LOGIN_CLIENT_SECRET required for code exchange')
  }

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code:          params.code,
    redirect_uri:  params.redirectUri,
    client_id:     config.telegram.loginClientId,
    code_verifier: params.codeVerifier,
  })

  const basic = Buffer.from(
    `${config.telegram.loginClientId}:${config.telegram.loginClientSecret}`,
  ).toString('base64')

  const res = await fetch('https://oauth.telegram.org/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Accept':        'application/json',
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }
  return res.json() as Promise<{ id_token: string; access_token: string; expires_in: number }>
}
