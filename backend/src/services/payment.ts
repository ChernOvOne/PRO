import { createHash, createHmac, randomUUID } from 'crypto'
import axios from 'axios'
import { config }    from '../config'
import { logger }    from '../utils/logger'
import { prisma }    from '../db'
import { remnawave } from './remnawave'
import { notifications } from './notifications'
import { balanceService }    from './balance'
import type { Tariff, User } from '@prisma/client'

/**
 * Process a subscription refund — roll back days, update status, recalculate
 * currentPlan based on the user's most recent remaining PAID payment.
 * Shared by admin manual refund and YuKassa webhook.
 */
export async function handleSubscriptionRefund(paymentId: string, isFullRefund: boolean): Promise<void> {
  if (!isFullRefund) return   // partial refund: keep subscription active
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { user: true, tariff: true },
  })
  const pAny: any = payment
  if (!payment || !pAny.user || payment.purpose !== 'SUBSCRIPTION') return

  const user = pAny.user
  const daysToRollback = pAny.tariff?.durationDays || 0

  // Roll back days in local DB
  const now = new Date()
  let newExpire = user.subExpireAt ? new Date(user.subExpireAt) : now
  if (daysToRollback > 0) newExpire.setDate(newExpire.getDate() - daysToRollback)

  // Find the most recent PAID (not refunded) SUBSCRIPTION payment — its tariff
  // becomes the new currentPlan. If none → clear plan.
  const lastPaidPayment: any = await prisma.payment.findFirst({
    where: {
      userId: user.id,
      status: 'PAID',
      purpose: 'SUBSCRIPTION',
      id: { not: payment.id },
    },
    orderBy: { updatedAt: 'desc' },
    include: { tariff: true },
  })
  const paymentFull: any = payment

  const isExpired = newExpire <= now
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subExpireAt:    newExpire,
      subStatus:      isExpired ? 'EXPIRED' : 'ACTIVE',
      totalPaid:      { decrement: payment.amount },
      paymentsCount:  { decrement: 1 },
      currentPlan:    lastPaidPayment?.tariff?.name     ?? null,
      currentPlanTag: lastPaidPayment?.tariff?.remnawaveTag ?? null,
    },
  })

  // Roll back REMNAWAVE expireAt too
  if (user.remnawaveUuid && daysToRollback > 0) {
    try {
      const rmUser = await remnawave.getUserByUuid(user.remnawaveUuid)
      if (rmUser?.expireAt) {
        const rmExpire = new Date(rmUser.expireAt)
        rmExpire.setDate(rmExpire.getDate() - daysToRollback)
        await remnawave.updateUser({
          uuid: user.remnawaveUuid,
          expireAt: rmExpire.toISOString(),
          status: rmExpire <= now ? 'DISABLED' : 'ACTIVE',
        } as any)
      }
    } catch (err: any) {
      logger.warn(`Failed to roll back REMNAWAVE expire for ${user.id}: ${err?.message}`)
    }
  }

  logger.info(`Refund processed: payment ${payment.id}, user ${user.id}, -${daysToRollback} days, plan='${lastPaidPayment?.tariff?.name ?? '(none)'}'`)
}

// Automatically open a support ticket for the admin when a payment succeeds
// but the VPN subscription couldn't be provisioned/extended on the panel.
// Deduped by order id — won't create duplicates on retries.
async function reportSubscriptionIssue(params: {
  user: User
  orderId: string
  tariffName: string
  errorMessage: string
  remnawaveUuid?: string | null
}) {
  try {
    const { user, orderId, tariffName, errorMessage, remnawaveUuid } = params
    const subject = `⚠️ Проблема с подпиской при оплате`
    // Dedupe: skip if ticket for this order already exists
    const existing = await prisma.ticket.findFirst({
      where: { userId: user.id, subject, category: 'BILLING' },
      orderBy: { createdAt: 'desc' },
    })
    if (existing) {
      const minutesSince = (Date.now() - existing.createdAt.getTime()) / 60_000
      if (minutesSince < 30) return // recent ticket for same user — don't spam
    }

    const body = [
      `Автоматическое уведомление от системы платежей.`,
      ``,
      `👤 Пользователь: ${user.email || user.telegramName || user.id}`,
      `🆔 ID: ${user.id}`,
      `📋 Order ID: ${orderId}`,
      `💳 Тариф: ${tariffName}`,
      `🔗 REMNAWAVE UUID: ${remnawaveUuid || '(нет)'}`,
      ``,
      `❌ Ошибка: ${errorMessage}`,
      ``,
      `Проверьте синхронизацию подписки вручную.`,
    ].join('\n')

    await prisma.ticket.create({
      data: {
        userId: user.id,
        subject,
        category: 'BILLING',
        source: 'WEB',
        unreadByAdmin: 1,
        lastMessageAt: new Date(),
        messages: {
          create: {
            authorType: 'SYSTEM',
            body,
            source: 'WEB',
            isInternal: false,
          },
        },
      },
    })
    logger.info(`[Ticket] Subscription issue ticket created for user ${user.id}, order ${orderId}`)
  } catch (err: any) {
    logger.error(`[Ticket] Failed to open subscription-issue ticket: ${err?.message}`)
  }
}

// ── ЮKassa types ─────────────────────────────────────────────
interface YukassaAmount {
  value: string
  currency: string
}

interface YukassaPaymentFull {
  id: string
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled'
  paid: boolean
  amount: YukassaAmount
  income_amount?: YukassaAmount
  refunded_amount?: YukassaAmount
  description?: string
  metadata?: Record<string, string>
  created_at: string
  captured_at?: string
  payment_method?: { type: string; card?: { last4: string } }
  refundable?: boolean
}

interface YukassaRefund {
  id: string
  payment_id: string
  status: 'succeeded' | 'canceled'
  amount: YukassaAmount
  created_at: string
  description?: string
}

// ── ЮKassa ───────────────────────────────────────────────────
class YukassaService {
  private readonly BASE_URL = 'https://api.yookassa.ru/v3'

  /** Credentials live in DB (admin settings) with env as fallback.
   *  Cached 30s so we don't pound the DB for every payment call. */
  private credsCache: { shopId: string; secret: string; expires: number } | null = null

  private async getCreds(): Promise<{ shopId: string; secret: string }> {
    const now = Date.now()
    if (this.credsCache && now < this.credsCache.expires) return this.credsCache

    const rows = await prisma.setting.findMany({
      where: { key: { in: ['yukassa_shop_id', 'yukassa_secret'] } },
    }).catch(() => [])
    const map: Record<string, string> = {}
    rows.forEach(r => { map[r.key] = r.value })

    const shopId = map.yukassa_shop_id || config.yukassa.shopId || ''
    const secret = map.yukassa_secret  || config.yukassa.secretKey || ''
    this.credsCache = { shopId, secret, expires: now + 30_000 }
    return this.credsCache
  }

  /** Force a re-read on next request — called from admin-settings when creds change. */
  invalidateCache() { this.credsCache = null }

  private async getAuth(): Promise<string> {
    const { shopId, secret } = await this.getCreds()
    return Buffer.from(`${shopId}:${secret}`).toString('base64')
  }

  async createPayment(params: {
    amount:      number
    description: string
    orderId:     string
    returnUrl:   string
    metadata?:   Record<string, string>
    // 54-FZ receipt fields (optional — included only if receipt is configured)
    receipt?:    {
      customerEmail?: string
      customerPhone?: string
      itemDescription: string
      vatCode:       number   // 1-6
      paymentSubject: string  // commodity | service | ...
      paymentMode:   string   // full_prepayment | ...
    }
    taxSystemCode?: number  // 1-6
    captureMode?:   'auto' | 'manual'
  }) {
    const body: any = {
      amount:       { value: params.amount.toFixed(2), currency: 'RUB' },
      description:  params.description,
      confirmation: { type: 'redirect', return_url: params.returnUrl },
      capture:      params.captureMode !== 'manual',
      metadata:     { orderId: params.orderId, ...params.metadata },
    }

    // 54-FZ receipt — required for Russian merchants processing physical goods/services
    if (params.receipt) {
      body.receipt = {
        customer: {
          ...(params.receipt.customerEmail ? { email: params.receipt.customerEmail } : {}),
          ...(params.receipt.customerPhone ? { phone: params.receipt.customerPhone } : {}),
        },
        items: [{
          description:     params.receipt.itemDescription.slice(0, 128),
          quantity:        '1',
          amount:          { value: params.amount.toFixed(2), currency: 'RUB' },
          vat_code:        params.receipt.vatCode,
          payment_subject: params.receipt.paymentSubject,
          payment_mode:    params.receipt.paymentMode,
        }],
        ...(params.taxSystemCode ? { tax_system_code: params.taxSystemCode } : {}),
      }
    }

    const res = await axios.post(
      `${this.BASE_URL}/payments`,
      body,
      {
        headers: {
          Authorization:     `Basic ${await this.getAuth()}`,
          'Content-Type':    'application/json',
          'Idempotence-Key': randomUUID(),
        },
      },
    )
    return res.data as {
      id:           string
      status:       string
      confirmation: { confirmation_url: string }
    }
  }

  async getPayment(yukassaId: string) {
    const res = await axios.get(`${this.BASE_URL}/payments/${yukassaId}`, {
      headers: { Authorization: `Basic ${await this.getAuth()}` },
    })
    return res.data
  }

  async getPaymentFull(yukassaId: string): Promise<YukassaPaymentFull> {
    const res = await axios.get(`${this.BASE_URL}/payments/${yukassaId}`, {
      headers: { Authorization: `Basic ${await this.getAuth()}` },
    })
    return res.data as YukassaPaymentFull
  }

  /**
   * List payments from YuKassa API with pagination.
   * Returns up to 100 payments per request.
   */
  async listPayments(params: {
    createdAtGte?: string  // ISO date
    createdAtLte?: string
    status?: string
    cursor?: string
    limit?: number
  }): Promise<{ items: YukassaPaymentFull[]; nextCursor?: string }> {
    const query: Record<string, string> = {}
    if (params.createdAtGte) query['created_at.gte'] = params.createdAtGte
    if (params.createdAtLte) query['created_at.lte'] = params.createdAtLte
    if (params.status) query.status = params.status
    if (params.cursor) query.cursor = params.cursor
    query.limit = String(params.limit || 100)

    const qs = new URLSearchParams(query).toString()
    const res = await axios.get(`${this.BASE_URL}/payments?${qs}`, {
      headers: { Authorization: `Basic ${await this.getAuth()}` },
    })

    const data = res.data as { type: string; items: YukassaPaymentFull[]; next_cursor?: string }
    return { items: data.items || [], nextCursor: data.next_cursor }
  }

  /**
   * List refunds from YuKassa API.
   */
  async listRefunds(params: {
    createdAtGte?: string
    createdAtLte?: string
    paymentId?: string
    cursor?: string
    limit?: number
  }): Promise<{ items: YukassaRefund[]; nextCursor?: string }> {
    const query: Record<string, string> = {}
    if (params.createdAtGte) query['created_at.gte'] = params.createdAtGte
    if (params.createdAtLte) query['created_at.lte'] = params.createdAtLte
    if (params.paymentId) query.payment_id = params.paymentId
    if (params.cursor) query.cursor = params.cursor
    query.limit = String(params.limit || 100)

    const qs = new URLSearchParams(query).toString()
    const res = await axios.get(`${this.BASE_URL}/refunds?${qs}`, {
      headers: { Authorization: `Basic ${await this.getAuth()}` },
    })

    const data = res.data as { type: string; items: YukassaRefund[]; next_cursor?: string }
    return { items: data.items || [], nextCursor: data.next_cursor }
  }

  /**
   * Create a refund via YuKassa API
   */
  async createRefund(yukassaPaymentId: string, amount: number): Promise<{ id: string; status: string; amount: YukassaAmount }> {
    const body: any = {
      payment_id: yukassaPaymentId,
      amount: { value: amount.toFixed(2), currency: 'RUB' },
    }
    const res = await axios.post(`${this.BASE_URL}/refunds`, body, {
      headers: {
        Authorization: `Basic ${await this.getAuth()}`,
        'Content-Type': 'application/json',
        'Idempotence-Key': randomUUID(),
      },
    })
    return res.data
  }

  /**
   * Fetch a payment from YuKassa by id, returning null on any error.
   * Used to re-verify webhook claims — since YuKassa webhooks aren't
   * HMAC-signed, we treat the body as a notification trigger and trust
   * only what the authenticated API call returns.
   */
  async getPaymentSafe(yukassaPaymentId: string): Promise<{ id: string; status: string; amount: YukassaAmount } | null> {
    try {
      const res = await axios.get(`${this.BASE_URL}/payments/${yukassaPaymentId}`, {
        headers: { Authorization: `Basic ${await this.getAuth()}` },
        timeout: 10_000,
      })
      return res.data
    } catch (e: any) {
      logger.warn(`YuKassa getPaymentSafe(${yukassaPaymentId}) failed: ${e?.message}`)
      return null
    }
  }

  /**
   * Strict CIDR check using ipaddr.js-style numeric comparison. YuKassa
   * publishes a fixed list of webhook source IPs in their docs.
   */
  verifyWebhookIp(ip: string): boolean {
    if (!ip) return false
    const allowedV4: Array<[string, number]> = [
      ['185.71.76.0', 27], ['185.71.77.0', 27],
      ['77.75.153.0', 25], ['77.75.156.11', 32], ['77.75.156.35', 32],
      ['77.75.154.128', 25],
    ]
    const allowedV6Prefixes = ['2a02:5180:']
    if (ip.includes(':')) {
      return allowedV6Prefixes.some(p => ip.toLowerCase().startsWith(p))
    }
    const ipNum = ipv4ToInt(ip)
    if (ipNum == null) return false
    return allowedV4.some(([cidr, bits]) => {
      const cidrNum = ipv4ToInt(cidr)
      if (cidrNum == null) return false
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
      return (ipNum & mask) === (cidrNum & mask)
    })
  }
}

function ipv4ToInt(ip: string): number | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = m.slice(1, 5).map(Number)
  if (parts.some(p => p < 0 || p > 255)) return null
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0
}

// ── CryptoPay ────────────────────────────────────────────────
class CryptoPayService {
  private credsCache: { token: string; baseUrl: string; expires: number } | null = null

  private async getCreds(): Promise<{ token: string; baseUrl: string }> {
    const now = Date.now()
    if (this.credsCache && now < this.credsCache.expires) return this.credsCache

    const rows = await prisma.setting.findMany({
      where: { key: { in: ['crypto_token', 'crypto_network'] } },
    }).catch(() => [])
    const map: Record<string, string> = {}
    rows.forEach(r => { map[r.key] = r.value })

    const token   = map.crypto_token   || config.cryptopay.apiToken || ''
    const network = map.crypto_network || config.cryptopay.network  || 'mainnet'
    const baseUrl = network === 'mainnet'
      ? 'https://pay.crypt.bot/api'
      : 'https://testnet-pay.crypt.bot/api'
    this.credsCache = { token, baseUrl, expires: now + 30_000 }
    return this.credsCache
  }

  invalidateCache() { this.credsCache = null }

  private async buildHeaders(): Promise<Record<string, string>> {
    const { token } = await this.getCreds()
    return { 'Crypto-Pay-API-Token': token }
  }

  private async apiUrl(path: string): Promise<string> {
    const { baseUrl } = await this.getCreds()
    return `${baseUrl}${path}`
  }

  async createInvoice(params: {
    amount:      number
    currency:    'USDT' | 'TON' | 'BTC' | 'ETH' | 'LTC'
    description: string
    orderId:     string
    expiresIn?:  number // seconds, default 3600
  }) {
    const res = await axios.post(
      await this.apiUrl('/createInvoice'),
      {
        asset:         params.currency,
        amount:        params.amount.toString(),
        description:   params.description,
        payload:       params.orderId,
        expires_in:    params.expiresIn || 3600,
        allow_comments: false,
        allow_anonymous: false,
      },
      { headers: await this.buildHeaders() },
    )
    if (!res.data.ok) throw new Error(`CryptoPay error: ${JSON.stringify(res.data)}`)
    return res.data.result as {
      invoice_id:  number
      status:      string
      pay_url:     string
      bot_invoice_url: string
    }
  }

  async getInvoice(invoiceId: number) {
    const res = await axios.get(await this.apiUrl('/getInvoices'), {
      params:  { invoice_ids: String(invoiceId) },
      headers: await this.buildHeaders(),
    })
    return res.data.result?.items?.[0]
  }

  async verifyWebhookSignature(token: string, body: string): Promise<boolean> {
    const { token: apiToken } = await this.getCreds()
    const secretKey = createHash('sha256')
      .update(apiToken)
      .digest()
    const checkHash = createHmac('sha256', secretKey)
      .update(body)
      .digest('hex')
    return checkHash === token
  }
}

// ── Platega.io ───────────────────────────────────────────────
// Russian payment aggregator. Thin API: X-MerchantId + X-Secret headers.
// Payment methods: 2=СБП QR, 3=ЕРИП, 11=Card, 12=International, 13=Crypto.
// Docs: https://docs.platega.io
class PlategaService {
  private readonly BASE_URL = 'https://app.platega.io'

  /**
   * Read credentials from DB first (settings UI), fall back to env.
   * Cached for 30s to avoid DB hit per request.
   */
  private credsCache: { merchantId: string; secret: string; expires: number } | null = null

  private async getCreds(): Promise<{ merchantId: string; secret: string }> {
    const now = Date.now()
    if (this.credsCache && now < this.credsCache.expires) return this.credsCache

    const rows = await prisma.setting.findMany({
      where: { key: { in: ['platega_merchant_id', 'platega_secret'] } },
    }).catch(() => [])
    const map: Record<string, string> = {}
    rows.forEach(r => { map[r.key] = r.value })

    const merchantId = map.platega_merchant_id || process.env.PLATEGA_MERCHANT_ID || ''
    const secret     = map.platega_secret     || process.env.PLATEGA_SECRET     || ''
    this.credsCache = { merchantId, secret, expires: now + 30_000 }
    return this.credsCache
  }

  invalidateCache() { this.credsCache = null }

  private async buildHeaders() {
    const { merchantId, secret } = await this.getCreds()
    return {
      'Content-Type': 'application/json',
      'X-MerchantId': merchantId,
      'X-Secret':     secret,
    }
  }

  async createPayment(params: {
    amount:        number
    currency?:     string
    paymentMethod: number   // 2=SBP, 11=Card, 13=Crypto, ...
    description:   string
    orderId:       string
    returnUrl:     string
    failedUrl?:    string
  }) {
    const res = await axios.post(
      `${this.BASE_URL}/transaction/process`,
      {
        paymentMethod:  params.paymentMethod,
        paymentDetails: {
          amount:   params.amount,
          currency: params.currency || 'RUB',
        },
        description: params.description,
        return:      params.returnUrl,
        ...(params.failedUrl ? { failedUrl: params.failedUrl } : {}),
        payload:     params.orderId,
      },
      { headers: await this.buildHeaders(), timeout: 20_000 },
    )
    return res.data as {
      transactionId: string
      redirect:      string
      status:        string   // "PENDING"
      expiresIn:     string
      usdtRate?:     number
      paymentMethod: number
    }
  }

  async getTransaction(id: string) {
    const res = await axios.get(`${this.BASE_URL}/transaction/${id}`, {
      headers: await this.buildHeaders(),
      timeout: 20_000,
    })
    return res.data as {
      id:            string
      status:        'PENDING' | 'CONFIRMED' | 'CANCELED' | 'CHARGEBACKED'
      paymentDetails: { amount: number; currency: string }
      comission?:    number
      payload?:      string
      description?:  string
    }
  }

  /**
   * Verify webhook by comparing X-Secret header against configured value.
   * No HMAC signing — static shared secret.
   * IMPORTANT: always also call getTransaction() to re-verify amount + status.
   */
  async verifyWebhookSecret(headerSecret: string | undefined): Promise<boolean> {
    if (!headerSecret) return false
    const { secret } = await this.getCreds()
    return !!secret && headerSecret === secret
  }
}

// ── Payment orchestrator ──────────────────────────────────────
export class PaymentService {
  yukassa  = new YukassaService()
  cryptopay = new CryptoPayService()
  platega  = new PlategaService()

  // ── Create payment order ───────────────────────────────────
  async createOrder(params: {
    user:     User
    tariff:   Tariff
    provider: 'YUKASSA' | 'CRYPTOPAY' | 'PLATEGA'
    currency?: string
    purpose?: 'SUBSCRIPTION' | 'TOPUP' | 'GIFT' | 'SQUAD_ADDON'
    paymentMethod?: number  // for Platega
    // For SQUAD_ADDON / TOPUP: carry metadata so confirmPayment can
    // reconstruct the purchase (addon ids, prorated days, etc.)
    metadata?: Record<string, any>
  }) {
    const { user, tariff, provider } = params
    const orderId = randomUUID()

    const purpose  = params.purpose || 'SUBSCRIPTION'
    // SQUAD_ADDON and TOPUP don't reference a real Tariff row
    const virtualPurpose = purpose === 'TOPUP' || purpose === 'SQUAD_ADDON'

    // Create pending payment record
    // YuKassa & Platega both in RUB; only CryptoPay uses USDT/TON/etc.
    const isRubProvider = provider === 'YUKASSA' || provider === 'PLATEGA'
    const payment = await prisma.payment.create({
      data: {
        id:       orderId,
        userId:   user.id,
        tariffId: virtualPurpose ? null : tariff.id,
        provider,
        amount:   isRubProvider ? tariff.priceRub : (tariff.priceUsdt ?? 0),
        currency: isRubProvider ? 'RUB' : (params.currency ?? 'USDT'),
        status:   'PENDING',
        purpose,
        // Stash metadata inside yukassaStatus field (used for misc JSON blobs already)
        ...(params.metadata ? { yukassaStatus: JSON.stringify(params.metadata) } : {}),
      },
    })

    // Create provider payment
    if (provider === 'YUKASSA') {
      // Load YuKassa settings for description + receipt customization
      const settingKeys = [
        'yukassa_description_template', 'yukassa_return_url',
        'yukassa_capture_mode', 'yukassa_receipt_enabled',
        'yukassa_vat_code', 'yukassa_payment_subject',
        'yukassa_payment_mode', 'yukassa_tax_system_code',
        'app_name',
      ]
      const settingRows = await prisma.setting.findMany({ where: { key: { in: settingKeys } } })
      const s: Record<string, string> = {}
      settingRows.forEach(r => { s[r.key] = r.value })

      const appName  = s.app_name || 'HIDEYOU VPN'
      const template = s.yukassa_description_template || '{app_name} — {tariff}'
      const returnBase = s.yukassa_return_url || `${config.appUrl}/dashboard/payment-success`

      const description = template
        .replace(/\{app_name\}/g, appName)
        .replace(/\{tariff\}/g, tariff.name)
        .replace(/\{days\}/g, String(tariff.durationDays ?? ''))
        .replace(/\{user\}/g, user.email || user.telegramName || user.id.slice(0, 8))
        .replace(/\{amount\}/g, tariff.priceRub.toFixed(2))
        .slice(0, 128)  // YuKassa limit

      // Ensure separator between base return URL and query
      const retSep = returnBase.includes('?') ? '&' : '?'
      const returnUrl = `${returnBase}${retSep}orderId=${payment.id}`

      // Build receipt only if enabled
      let receipt: any = undefined
      if (s.yukassa_receipt_enabled === '1') {
        const email = user.email || undefined
        receipt = {
          customerEmail:  email,
          itemDescription: description,
          vatCode:        Number(s.yukassa_vat_code || 1),          // 1 = без НДС
          paymentSubject: s.yukassa_payment_subject || 'service',   // товар/услуга
          paymentMode:    s.yukassa_payment_mode    || 'full_prepayment',
        }
      }

      const yp = await this.yukassa.createPayment({
        amount:       tariff.priceRub,
        description,
        orderId:      payment.id,
        returnUrl,
        metadata:     { userId: user.id, tariffId: tariff.id },
        receipt,
        taxSystemCode: s.yukassa_tax_system_code ? Number(s.yukassa_tax_system_code) : undefined,
        captureMode:  (s.yukassa_capture_mode as 'auto' | 'manual') || 'auto',
      })

      await prisma.payment.update({
        where: { id: payment.id },
        data:  {
          providerOrderId: yp.id,
          yukassaPaymentId: yp.id,
          yukassaStatus:    yp.status,
        },
      })

      return {
        orderId:    payment.id,
        paymentUrl: yp.confirmation.confirmation_url,
        provider:   'YUKASSA' as const,
      }
    }

    if (provider === 'PLATEGA') {
      const pKeys = [
        'platega_description_template', 'platega_return_url',
        'platega_payment_method', 'app_name',
      ]
      const pRows = await prisma.setting.findMany({ where: { key: { in: pKeys } } })
      const ps: Record<string, string> = {}
      pRows.forEach(r => { ps[r.key] = r.value })

      const appName = ps.app_name || 'HIDEYOU VPN'
      const tpl = ps.platega_description_template || '{app_name} — {tariff}'
      const pm = Number(ps.platega_payment_method || 2)  // 2 = СБП

      const description = tpl
        .replace(/\{app_name\}/g, appName)
        .replace(/\{tariff\}/g, tariff.name)
        .replace(/\{days\}/g, String(tariff.durationDays ?? ''))
        .replace(/\{amount\}/g, tariff.priceRub.toFixed(2))
        .slice(0, 255)

      const retBase = ps.platega_return_url || `${config.appUrl}/dashboard/payment-success`
      const sep = retBase.includes('?') ? '&' : '?'
      const returnUrl = `${retBase}${sep}orderId=${payment.id}`

      const tx = await this.platega.createPayment({
        amount:        tariff.priceRub,
        paymentMethod: pm,
        description,
        orderId:       payment.id,
        returnUrl,
      })

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerOrderId: tx.transactionId,
        },
      })

      return {
        orderId:    payment.id,
        paymentUrl: tx.redirect,
        provider:   'PLATEGA' as const,
      }
    }

    if (provider === 'CRYPTOPAY') {
      // Load CryptoPay settings for description + expiration
      const cKeys = ['crypto_description_template', 'crypto_expires_in',
                     'crypto_default_currency', 'app_name']
      const cRows = await prisma.setting.findMany({ where: { key: { in: cKeys } } })
      const cs: Record<string, string> = {}
      cRows.forEach(r => { cs[r.key] = r.value })

      const appName = cs.app_name || 'HIDEYOU VPN'
      const tpl = cs.crypto_description_template || '{app_name} — {tariff}'
      const defaultCur = (cs.crypto_default_currency as any) || 'USDT'
      const expiresIn = Number(cs.crypto_expires_in || 3600)

      const currency = (params.currency ?? defaultCur) as 'USDT' | 'TON' | 'BTC' | 'ETH' | 'LTC'
      const amount   = tariff.priceUsdt ?? tariff.priceRub / 90 // fallback conversion

      const description = tpl
        .replace(/\{app_name\}/g, appName)
        .replace(/\{tariff\}/g, tariff.name)
        .replace(/\{days\}/g, String(tariff.durationDays ?? ''))
        .replace(/\{amount\}/g, amount.toFixed(2))
        .slice(0, 1024)

      const invoice = await this.cryptopay.createInvoice({
        amount,
        currency,
        description,
        orderId:     payment.id,
        expiresIn,
      })

      await prisma.payment.update({
        where: { id: payment.id },
        data:  {
          providerOrderId: String(invoice.invoice_id),
          cryptoInvoiceId: invoice.invoice_id,
          cryptoCurrency:  currency,
          cryptoAmount:    String(amount),
        },
      })

      return {
        orderId:    payment.id,
        paymentUrl: invoice.pay_url || invoice.bot_invoice_url,
        provider:   'CRYPTOPAY' as const,
      }
    }

    throw new Error('Unknown payment provider')
  }

  // ── Confirm payment & activate subscription ────────────────
  async confirmPayment(orderId: string) {
    const payment = await prisma.payment.findUnique({
      where:   { id: orderId },
      include: { user: true, tariff: true },
    })

    if (!payment) throw new Error(`Payment not found: ${orderId}`)
    if (payment.status === 'PAID') {
      logger.info(`Payment ${orderId} already confirmed, skipping`)
      return
    }

    // Update payment status
    const updateData: any = { status: 'PAID', confirmedAt: new Date() }

    // Fetch commission from YuKassa API if available
    if (payment.provider === 'YUKASSA' && payment.yukassaPaymentId) {
      try {
        const ypFull = await this.yukassa.getPaymentFull(payment.yukassaPaymentId)
        if (ypFull.income_amount) {
          const gross = parseFloat(ypFull.amount.value)
          const net = parseFloat(ypFull.income_amount.value)
          const commission = Math.max(0, +(gross - net).toFixed(2))
          if (commission > 0) {
            updateData.commission = commission
            updateData.amount = net
          }
        }
      } catch (e: any) {
        logger.warn(`Failed to fetch YuKassa commission for ${orderId}: ${e.message}`)
      }
    }

    await prisma.payment.update({
      where: { id: orderId },
      data: updateData,
    })

    const { user } = payment

    if (!user) {
      logger.info(`Payment ${orderId} confirmed but no user linked, skipping subscription activation`)
      return
    }

    // Override tariff values from payment metadata (variants/configurator)
    let meta: any = null
    try { meta = JSON.parse(payment.yukassaStatus || '{}') } catch {}

    // Non-subscription purposes have no tariff; handle them first and return.
    // The SUBSCRIPTION path below assumes `tariff` is present.
    const tariff = payment.tariff
    let effectiveDays = tariff?.durationDays ?? 0
    let effectiveTrafficGb = tariff?.trafficGb ?? null
    let effectiveDeviceLimit = tariff?.deviceLimit ?? 3

    if (meta?._mode === 'variant') {
      effectiveDays = meta.days ?? effectiveDays
      if (meta.trafficGb != null) effectiveTrafficGb = meta.trafficGb
      if (meta.deviceLimit != null) effectiveDeviceLimit = meta.deviceLimit
    }
    if (meta?._mode === 'configurator') {
      effectiveDays = meta.days ?? effectiveDays
      effectiveTrafficGb = meta.trafficGb ?? effectiveTrafficGb
      effectiveDeviceLimit = meta.devices ?? effectiveDeviceLimit
    }

    // Handle squad addon purchase — activate, sync squads
    if (payment.purpose === 'SQUAD_ADDON') {
      try {
        const { syncUserSquadsToRemnawave } = await import('./squad-addons')
        let meta: any = {}
        try { meta = JSON.parse(payment.yukassaStatus || '{}') } catch {}
        if (meta?._type !== 'squad_addon') {
          logger.warn(`SQUAD_ADDON payment ${orderId} has no metadata — skipping activation`)
          return
        }
        const expireAt = new Date(meta.expireAt)
        await prisma.userSquadAddon.upsert({
          where: { userId_squadUuid: { userId: user.id, squadUuid: meta.squadUuid } },
          create: {
            userId:              user.id,
            squadUuid:           meta.squadUuid,
            title:               meta.title || 'Доп. сервер',
            expireAt,
            pricePerMonthLocked: meta.pricePerMonthLocked ?? 0,
            pricePerDayLocked:   meta.pricePerDayLocked,
            paymentId:           payment.id,
            source:              'PURCHASE',
            cancelledAt:         null,
          },
          update: {
            title:               meta.title || 'Доп. сервер',
            expireAt,
            pricePerMonthLocked: meta.pricePerMonthLocked ?? 0,
            pricePerDayLocked:   meta.pricePerDayLocked,
            paymentId:           payment.id,
            cancelledAt:         null,
            source:              'PURCHASE',
          },
        })
        await syncUserSquadsToRemnawave(user.id)
        logger.info(`Squad addon activated: ${orderId}, user ${user.id}, squad ${meta.squadUuid}`)
      } catch (err: any) {
        logger.error(`Squad addon activation failed for ${orderId}: ${err?.message}`)
      }
      return
    }

    // Handle balance top-up
    if (payment.purpose === 'TOPUP') {
      await balanceService.credit({
        userId:      user.id,
        amount:      payment.amount,
        type:        'TOPUP',
        description: `Пополнение баланса`,
        paymentId:   payment.id,
      })
      logger.info(`Balance top-up confirmed: ${orderId}, +${payment.amount} ${payment.currency}`)
      return
    }

    // Handle gift payment — create gift after payment confirmed
    if (payment.purpose === 'GIFT') {
      try {
        const { giftService } = await import('./gift')
        // Parse gift metadata from yukassaStatus field (temp storage)
        let recipientEmail: string | undefined
        let message: string | undefined
        let noExpiry = false
        try {
          const meta = JSON.parse(payment.yukassaStatus || '{}')
          if (meta._giftMeta) {
            recipientEmail = meta.recipientEmail || undefined
            message        = meta.message        || undefined
            noExpiry       = !!meta.noExpiry
          }
        } catch {}

        if (!payment.tariffId) {
          logger.warn(`Gift payment ${orderId} has no tariffId — cannot create gift`)
          return
        }
        await giftService.createGift({
          fromUserId:     user.id,
          tariffId:       payment.tariffId,
          paymentId:      payment.id,
          recipientEmail,
          message,
          expiresAt:      noExpiry ? null : undefined,
        })
        logger.info(`Gift created from payment: ${orderId}`)
      } catch (err) {
        logger.error(`Failed to create gift from payment ${orderId}:`, err)
      }
      return
    }

    // From here on we're activating a SUBSCRIPTION — requires a real tariff.
    if (!tariff) {
      logger.info(`Payment ${orderId} has no tariff — non-subscription purpose already handled, skipping activation`)
      return
    }

    // Activate / extend REMNAWAVE subscription
    let remnawaveUuid = user.remnawaveUuid

    // Convert tariff trafficGb to bytes (null = unlimited = 0)
    const trafficLimitBytes = effectiveTrafficGb ? effectiveTrafficGb * 1024 * 1024 * 1024 : 0
    const newExpireDate = new Date(Date.now() + effectiveDays * 86400_000)

    if (!remnawaveUuid) {
      // Create user in REMNAWAVE on first purchase
      try {
        const rmUser = await remnawave.createUser({
          username:             user.email ? user.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_') : user.telegramId ? `tg_${user.telegramId}` : `user_${user.id.slice(0, 8)}`,
          email:                user.email ?? undefined,
          telegramId:           user.telegramId ? parseInt(user.telegramId, 10) : null,
          expireAt:             newExpireDate.toISOString(),
          trafficLimitBytes,
          trafficLimitStrategy: tariff.trafficStrategy || 'MONTH',
          hwidDeviceLimit:      effectiveDeviceLimit ?? 3,
          tag:                  tariff.remnawaveTag ?? undefined,
          activeInternalSquads: tariff.remnawaveSquads.length > 0 ? tariff.remnawaveSquads : undefined,
        })
        remnawaveUuid = rmUser.uuid

        await prisma.user.update({
          where: { id: user.id },
          data:  {
            remnawaveUuid,
            subLink: remnawave.getSubscriptionUrl(rmUser.uuid),
          },
        })
      } catch (err: any) {
        logger.error(`REMNAWAVE createUser failed for ${user.id}: ${err?.message}. Proceeding with local DB update only.`)
        await reportSubscriptionIssue({
          user, orderId, tariffName: tariff.name,
          errorMessage: `Не удалось создать пользователя на REMNAWAVE: ${err?.message}`,
          remnawaveUuid,
        })
      }
    } else {
      // Extend existing subscription + apply tariff settings.
      // If UUID is orphan (404 = user doesn't exist on current panel — e.g. old
      // remnawaveUuid left from a previous panel), re-create the user there so
      // the payment actually activates the VPN instead of silently failing.
      try {
        const rmUser = await remnawave.getUserByUuid(remnawaveUuid)
        const currentExpire = rmUser.expireAt ? new Date(rmUser.expireAt) : new Date()
        const base = currentExpire > new Date() ? currentExpire : new Date()
        base.setDate(base.getDate() + effectiveDays)

        await remnawave.updateUser({
          uuid:                 remnawaveUuid,
          status:               'ACTIVE',
          expireAt:             base.toISOString(),
          trafficLimitBytes,
          trafficLimitStrategy: tariff.trafficStrategy || 'MONTH',
          hwidDeviceLimit:      effectiveDeviceLimit ?? 3,
          tag:                  tariff.remnawaveTag ?? undefined,
          activeInternalSquads: tariff.remnawaveSquads.length > 0 ? tariff.remnawaveSquads : undefined,
        })

        // Reset traffic after payment
        await remnawave.resetTrafficAction(remnawaveUuid).catch(err =>
          logger.warn(`Failed to reset traffic for ${remnawaveUuid}:`, err)
        )
      } catch (err: any) {
        const is404 = err?.response?.status === 404 || String(err?.message).includes('404')
        if (is404) {
          logger.warn(`REMNAWAVE user ${remnawaveUuid} not found (404) — orphan UUID. Re-creating on current panel...`)
          try {
            const rmUser = await remnawave.createUser({
              username:             user.email ? user.email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '_') : user.telegramId ? `tg_${user.telegramId}` : `user_${user.id.slice(0, 8)}`,
              email:                user.email ?? undefined,
              telegramId:           user.telegramId ? parseInt(user.telegramId, 10) : null,
              expireAt:             newExpireDate.toISOString(),
              trafficLimitBytes,
              trafficLimitStrategy: tariff.trafficStrategy || 'MONTH',
              hwidDeviceLimit:      effectiveDeviceLimit ?? 3,
              tag:                  tariff.remnawaveTag ?? undefined,
              activeInternalSquads: tariff.remnawaveSquads.length > 0 ? tariff.remnawaveSquads : undefined,
            })
            remnawaveUuid = rmUser.uuid
            await prisma.user.update({
              where: { id: user.id },
              data:  { remnawaveUuid, subLink: remnawave.getSubscriptionUrl(rmUser.uuid) },
            })
            logger.info(`Re-created REMNAWAVE user for ${user.id}: new UUID ${rmUser.uuid}`)
          } catch (createErr: any) {
            logger.error(`Failed to re-create orphan REMNAWAVE user for ${user.id}: ${createErr?.message}`)
            await reportSubscriptionIssue({
              user, orderId, tariffName: tariff.name,
              errorMessage: `Orphan UUID (${remnawaveUuid}): 404 на update, пересоздать также не удалось — ${createErr?.message}`,
              remnawaveUuid,
            })
          }
        } else {
          logger.error(`REMNAWAVE update failed for ${remnawaveUuid}: ${err?.message}. Proceeding with local DB update only.`)
          await reportSubscriptionIssue({
            user, orderId, tariffName: tariff.name,
            errorMessage: `REMNAWAVE update failed: ${err?.message}`,
            remnawaveUuid,
          })
        }
      }
    }

    // Update local subscription status — extend from current expireAt if still active
    const now = new Date()
    const currentLocalExpire = user.subExpireAt ? new Date(user.subExpireAt) : now
    const baseLocal = currentLocalExpire > now ? new Date(currentLocalExpire) : new Date(now)
    baseLocal.setDate(baseLocal.getDate() + effectiveDays)

    await prisma.user.update({
      where: { id: user.id },
      data:  {
        subStatus:      'ACTIVE',
        subExpireAt:    baseLocal,
        remnawaveUuid,
        currentPlan:    tariff.name,
        currentPlanTag: tariff.remnawaveTag ?? null,
      },
    })

    // Bundled squad addons: metadata._addons = [{ squadUuid, title, pricePerMonth }]
    // — snapshot taken at checkout. Addons expire together with the subscription.
    if (meta?._addons && Array.isArray(meta._addons) && meta._addons.length > 0) {
      try {
        const { syncUserSquadsToRemnawave } = await import('./squad-addons')
        for (const item of meta._addons) {
          if (!item?.squadUuid) continue
          const pricePerMonth = Number(item.pricePerMonth) || 0
          const pricePerDayLocked = pricePerMonth / 30
          await prisma.userSquadAddon.upsert({
            where: { userId_squadUuid: { userId: user.id, squadUuid: item.squadUuid } },
            create: {
              userId:              user.id,
              squadUuid:           item.squadUuid,
              title:               item.title || 'Доп. сервер',
              expireAt:            baseLocal,
              pricePerMonthLocked: pricePerMonth,
              pricePerDayLocked,
              paymentId:           payment.id,
              source:              'BUNDLED',
              cancelledAt:         null,
            },
            update: {
              title:               item.title || 'Доп. сервер',
              expireAt:            baseLocal,
              pricePerMonthLocked: pricePerMonth,
              pricePerDayLocked,
              paymentId:           payment.id,
              cancelledAt:         null,
              source:              'BUNDLED',
            },
          })
        }
        await syncUserSquadsToRemnawave(user.id)
      } catch (err: any) {
        logger.warn(`Bundled addons activation failed for ${orderId}: ${err?.message}`)
      }
    } else {
      // No bundled addons — re-sync anyway so active addons survive any
      // base-squad changes in the tariff.
      try {
        const { syncUserSquadsToRemnawave } = await import('./squad-addons')
        await syncUserSquadsToRemnawave(user.id).catch(() => {})
      } catch {}
    }

    // Handle referral bonus (uses new referral service with admin settings)
    if (user.referredById) {
      try {
        const { applyReferralOnPayment } = await import('./referral')
        await applyReferralOnPayment({
          inviteeUserId: user.id,
          referrerId:    user.referredById,
          paymentId:     payment.id,
          paymentAmount: Number(payment.amount),
        })
      } catch (err: any) {
        logger.warn(`Referral bonus failed: ${err.message}`)
      }
    }

    logger.info(`Payment confirmed: ${orderId}, user: ${user.id}, +${effectiveDays} days`)

    // Mark UTM lead as converted
    try {
      if (user.customerSource) {
        await prisma.buhUtmLead.updateMany({
          where: { customerId: user.id, utmCode: user.customerSource, converted: false },
          data: { converted: true },
        })
        logger.info(`UTM lead converted: user=${user.id}, utm=${user.customerSource}`)
      }
    } catch (err) {
      logger.warn('Failed to mark UTM lead as converted:', err)
    }

    // Update user payment aggregates (для LTV / истории оплат в карточке клиента)
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totalPaid:     { increment: payment.amount },
          paymentsCount: { increment: 1 },
          lastPaymentAt: new Date(),
        },
      })
    } catch (err) {
      logger.warn('Failed to update user payment aggregates:', err)
    }

    // Send payment confirmation notifications (Telegram + Email)
    await notifications.paymentConfirmed(user.id, tariff.name, baseLocal).catch(err =>
      logger.warn('Payment notification failed:', err)
    )

    // Trigger payment funnel
    import('./funnel-engine').then(({ triggerEvent }) =>
      triggerEvent('payment_success', user.id, { tariffName: tariff.name, amount: String(payment.amount) }).catch(() => {})
    )
  }

  // Old applyReferralBonus removed — replaced by services/referral.ts (full impl with admin settings).
}

export const paymentService = new PaymentService()
