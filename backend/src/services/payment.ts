import { createHash, createHmac, randomUUID } from 'crypto'
import axios from 'axios'
import { config }    from '../config'
import { logger }    from '../utils/logger'
import { prisma }    from '../db'
import { remnawave } from './remnawave'
import { notifications } from './notifications'
import type { Tariff, User } from '@prisma/client'

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
    return res.data as { id: string; status: string; paid: boolean }
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
    await prisma.payment.update({
      where: { id: orderId },
      data:  { status: 'PAID', confirmedAt: new Date() },
    })

    // Activate / extend REMNAWAVE subscription
    const { user, tariff } = payment
    let remnawaveUuid = user.remnawaveUuid

    if (!remnawaveUuid) {
      // Create user in REMNAWAVE on first purchase
      const rmUser = await remnawave.createUser({
        username:   user.email || `tg_${user.telegramId}`,
        email:      user.email ?? undefined,
        telegramId: user.telegramId ?? undefined,
        expireAt:   new Date(Date.now() + tariff.durationDays * 86400_000).toISOString(),
        tagIds:     tariff.remnawaveTagIds,
      })
      remnawaveUuid = rmUser.uuid

      await prisma.user.update({
        where: { id: user.id },
        data:  {
          remnawaveUuid,
          subLink: remnawave.getSubscriptionUrl(rmUser.uuid),
        },
      })
    } else {
      // Extend existing subscription
      const rmUser = await remnawave.getUserByUuid(remnawaveUuid)
      await remnawave.extendSubscription(
        remnawaveUuid,
        tariff.durationDays,
        rmUser.expireAt ? new Date(rmUser.expireAt) : null,
      )
    }

    // Update local subscription status
    const newExpireAt = new Date()
    newExpireAt.setDate(newExpireAt.getDate() + tariff.durationDays)

    await prisma.user.update({
      where: { id: user.id },
      data:  {
        subStatus:   'ACTIVE',
        subExpireAt: newExpireAt,
        remnawaveUuid,
      },
    })

    // Handle referral bonus
    if (user.referredById) {
      await this.applyReferralBonus(user.referredById, payment.id)
    }

    logger.info(`Payment confirmed: ${orderId}, user: ${user.id}, +${tariff.durationDays} days`)

    // Send payment confirmation notifications (Telegram + Email)
    await notifications.paymentConfirmed(user.id, tariff.name, newExpireAt).catch(err =>
      logger.warn('Payment notification failed:', err)
    )
  }

  // ── Referral bonus ─────────────────────────────────────────
  private async applyReferralBonus(referrerId: string, paymentId: string) {
    try {
      const referrer = await prisma.user.findUnique({ where: { id: referrerId } })
      if (!referrer?.remnawaveUuid) return

      // Check if bonus already applied for this payment
      const existing = await prisma.referralBonus.findUnique({
        where: { triggeredByPaymentId: paymentId },
      })
      if (existing) return

      await prisma.referralBonus.create({
        data: {
          referrerId,
          triggeredByPaymentId: paymentId,
          bonusDays: config.referral.bonusDays,
        },
      })

      // Extend referrer subscription
      const rmUser = await remnawave.getUserByUuid(referrer.remnawaveUuid)
      await remnawave.extendSubscription(
        referrer.remnawaveUuid,
        config.referral.bonusDays,
        rmUser.expireAt ? new Date(rmUser.expireAt) : null,
      )

      // Notify referrer about bonus
      await notifications.referralBonus(referrerId, config.referral.bonusDays).catch(err =>
        logger.warn('Referral bonus notification failed:', err)
      )

      logger.info(`Referral bonus applied: +${config.referral.bonusDays} days to ${referrerId}`)
    } catch (err) {
      logger.error('Failed to apply referral bonus:', err)
    }
  }
}

export const paymentService = new PaymentService()
