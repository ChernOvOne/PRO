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
  if (!payment || !payment.user || payment.purpose !== 'SUBSCRIPTION') return

  const user = payment.user
  const daysToRollback = payment.tariff?.durationDays || 0

  // Roll back days in local DB
  const now = new Date()
  let newExpire = user.subExpireAt ? new Date(user.subExpireAt) : now
  if (daysToRollback > 0) newExpire.setDate(newExpire.getDate() - daysToRollback)

  // Find the most recent PAID (not refunded) SUBSCRIPTION payment — its tariff
  // becomes the new currentPlan. If none → clear plan.
  const lastPaidPayment = await prisma.payment.findFirst({
    where: {
      userId: user.id,
      status: 'PAID',
      purpose: 'SUBSCRIPTION',
      id: { not: payment.id },
    },
    orderBy: { paidAt: 'desc' },
    include: { tariff: true },
  })

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
  private readonly shopId   = config.yukassa.shopId!
  private readonly secret   = config.yukassa.secretKey!

  private get auth() {
    return Buffer.from(`${this.shopId}:${this.secret}`).toString('base64')
  }

  async createPayment(params: {
    amount:      number
    description: string
    orderId:     string
    returnUrl:   string
    metadata?:   Record<string, string>
  }) {
    const res = await axios.post(
      `${this.BASE_URL}/payments`,
      {
        amount:       { value: params.amount.toFixed(2), currency: 'RUB' },
        description:  params.description,
        confirmation: { type: 'redirect', return_url: params.returnUrl },
        capture:      true,
        metadata:     { orderId: params.orderId, ...params.metadata },
      },
      {
        headers: {
          Authorization:     `Basic ${this.auth}`,
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
      headers: { Authorization: `Basic ${this.auth}` },
    })
    return res.data
  }

  async getPaymentFull(yukassaId: string): Promise<YukassaPaymentFull> {
    const res = await axios.get(`${this.BASE_URL}/payments/${yukassaId}`, {
      headers: { Authorization: `Basic ${this.auth}` },
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
      headers: { Authorization: `Basic ${this.auth}` },
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
      headers: { Authorization: `Basic ${this.auth}` },
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
        Authorization: `Basic ${this.auth}`,
        'Content-Type': 'application/json',
        'Idempotence-Key': randomUUID(),
      },
    })
    return res.data
  }

  verifyWebhookIp(ip: string): boolean {
    // ЮKassa webhook IPs
    const allowed = [
      '185.71.76.0/27', '185.71.77.0/27',
      '77.75.153.0/25', '77.75.156.11', '77.75.156.35',
      '77.75.154.128/25', '2a02:5180::/32',
    ]
    // Simple string check for known IPs (use proper CIDR library in production)
    return allowed.some(range => ip.startsWith(range.split('/')[0].slice(0, -1)))
  }
}

// ── CryptoPay ────────────────────────────────────────────────
class CryptoPayService {
  private readonly BASE_URL = config.cryptopay.network === 'mainnet'
    ? 'https://pay.crypt.bot/api'
    : 'https://testnet-pay.crypt.bot/api'

  private get headers() {
    return { 'Crypto-Pay-API-Token': config.cryptopay.apiToken! }
  }

  async createInvoice(params: {
    amount:      number
    currency:    'USDT' | 'TON' | 'BTC' | 'ETH' | 'LTC'
    description: string
    orderId:     string
    expiresIn?:  number // seconds, default 3600
  }) {
    const res = await axios.post(
      `${this.BASE_URL}/createInvoice`,
      {
        asset:         params.currency,
        amount:        params.amount.toString(),
        description:   params.description,
        payload:       params.orderId,
        expires_in:    params.expiresIn || 3600,
        allow_comments: false,
        allow_anonymous: false,
      },
      { headers: this.headers },
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
    const res = await axios.get(`${this.BASE_URL}/getInvoices`, {
      params:  { invoice_ids: String(invoiceId) },
      headers: this.headers,
    })
    return res.data.result?.items?.[0]
  }

  verifyWebhookSignature(token: string, body: string): boolean {
    const secretKey = createHash('sha256')
      .update(config.cryptopay.apiToken!)
      .digest()
    const checkHash = createHmac('sha256', secretKey)
      .update(body)
      .digest('hex')
    return checkHash === token
  }
}

// ── Payment orchestrator ──────────────────────────────────────
export class PaymentService {
  yukassa  = new YukassaService()
  cryptopay = new CryptoPayService()

  // ── Create payment order ───────────────────────────────────
  async createOrder(params: {
    user:     User
    tariff:   Tariff
    provider: 'YUKASSA' | 'CRYPTOPAY'
    currency?: string
    purpose?: 'SUBSCRIPTION' | 'TOPUP' | 'GIFT'
  }) {
    const { user, tariff, provider } = params
    const orderId = randomUUID()

    // Create pending payment record
    const payment = await prisma.payment.create({
      data: {
        id:       orderId,
        userId:   user.id,
        tariffId: tariff.id,
        provider,
        amount:   provider === 'YUKASSA' ? tariff.priceRub : (tariff.priceUsdt ?? 0),
        currency: provider === 'YUKASSA' ? 'RUB' : (params.currency ?? 'USDT'),
        status:   'PENDING',
        purpose:  params.purpose || 'SUBSCRIPTION',
      },
    })

    // Create provider payment
    if (provider === 'YUKASSA') {
      const yp = await this.yukassa.createPayment({
        amount:      tariff.priceRub,
        description: `HIDEYOU VPN — ${tariff.name}`,
        orderId:     payment.id,
        returnUrl:   `${config.appUrl}/dashboard/payment-success?orderId=${payment.id}`,
        metadata:    { userId: user.id, tariffId: tariff.id },
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

    if (provider === 'CRYPTOPAY') {
      const currency = (params.currency ?? 'USDT') as 'USDT' | 'TON' | 'BTC'
      const amount   = tariff.priceUsdt ?? tariff.priceRub / 90 // fallback conversion

      const invoice = await this.cryptopay.createInvoice({
        amount,
        currency,
        description: `HIDEYOU VPN — ${tariff.name}`,
        orderId:     payment.id,
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

    const { user, tariff } = payment

    if (!user) {
      logger.info(`Payment ${orderId} confirmed but no user linked, skipping subscription activation`)
      return
    }

    // Override tariff values from payment metadata (variants/configurator)
    let meta: any = null
    try { meta = JSON.parse(payment.yukassaStatus || '{}') } catch {}

    let effectiveDays = tariff.durationDays
    let effectiveTrafficGb = tariff.trafficGb
    let effectiveDeviceLimit = tariff.deviceLimit

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
        try {
          const meta = JSON.parse(payment.yukassaStatus || '{}')
          if (meta._giftMeta) {
            recipientEmail = meta.recipientEmail || undefined
            message = meta.message || undefined
          }
        } catch {}

        await giftService.createGift({
          fromUserId:     user.id,
          tariffId:       payment.tariffId,
          paymentId:      payment.id,
          recipientEmail,
          message,
        })
        logger.info(`Gift created from payment: ${orderId}`)
      } catch (err) {
        logger.error(`Failed to create gift from payment ${orderId}:`, err)
      }
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
