import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:              z.enum(['development', 'production', 'test']).default('production'),
  PORT:                  z.coerce.number().default(4000),
  DOMAIN:                z.string().default('localhost'),
  ADMIN_DOMAIN:          z.string().optional(),
  API_DOMAIN:            z.string().optional(),
  APP_URL:               z.string().default('http://localhost:3000'),
  APP_SECRET:            z.string().optional(),
  JWT_SECRET:            z.string().min(32),
  JWT_EXPIRES_IN:        z.string().default('30d'),
  COOKIE_SECRET:         z.string().optional(),

  DATABASE_URL:          z.string(),
  REDIS_URL:             z.string(),
  REDIS_PASSWORD:        z.string().optional(),

  REMNAWAVE_URL:         z.string().url().default('http://localhost:3000'),
  // Опционально — сервис запустится без токена, функции REMNAWAVE будут недоступны
  REMNAWAVE_TOKEN:       z.string().optional().default(''),
  REMNAWAVE_SUBSCRIPTION_URL: z.string().optional(),

  // Опционально — сервис запустится без токена, Telegram-функции будут недоступны
  TELEGRAM_BOT_TOKEN:    z.string().optional().default(''),
  TELEGRAM_BOT_NAME:     z.string().optional().default(''),
  TELEGRAM_LOGIN_BOT_TOKEN: z.string().optional(),
  // New OIDC-based Telegram Login (https://core.telegram.org/bots/telegram-login).
  // Obtained in @BotFather → Bot Settings → Web Login. When CLIENT_ID is set the
  // frontend shows the new OIDC button (telegram-login.js) and the backend
  // accepts id_token at /api/auth/telegram-oidc. Otherwise the legacy
  // HMAC-based widget at /api/auth/telegram is used.
  TELEGRAM_LOGIN_CLIENT_ID:     z.string().optional(),
  TELEGRAM_LOGIN_CLIENT_SECRET: z.string().optional(),

  YUKASSA_SHOP_ID:       z.string().optional(),
  YUKASSA_SECRET_KEY:    z.string().optional(),
  YUKASSA_RETURN_URL:    z.string().optional(),
  YUKASSA_WEBHOOK_SECRET: z.string().optional(),

  CRYPTOPAY_API_TOKEN:   z.string().optional(),
  CRYPTOPAY_NETWORK:     z.enum(['mainnet', 'testnet']).default('mainnet'),

  REFERRAL_BONUS_DAYS:   z.coerce.number().default(30),
  REFERRAL_MIN_DAYS:     z.coerce.number().default(30),
  REFERRAL_REWARD_TYPE:  z.enum(['days', 'balance', 'both']).default('days'),
  REFERRAL_REWARD_AMOUNT: z.coerce.number().default(100),

  SMTP_HOST:             z.string().optional(),
  SMTP_PORT:             z.coerce.number().default(587),
  SMTP_USER:             z.string().optional(),
  SMTP_PASS:             z.string().optional(),
  SMTP_FROM:             z.string().optional(),

  FEATURE_CRYPTO_PAYMENTS: z.coerce.boolean().default(true),
  FEATURE_REFERRAL:        z.coerce.boolean().default(true),
  FEATURE_EMAIL_AUTH:      z.coerce.boolean().default(true),
  FEATURE_TELEGRAM_AUTH:   z.coerce.boolean().default(true),
  FEATURE_TRIAL:           z.coerce.boolean().default(false),
  TRIAL_DAYS:              z.coerce.number().default(3),
  FEATURE_GIFTS:           z.coerce.boolean().default(true),
  FEATURE_BALANCE:         z.coerce.boolean().default(true),

  GIFT_CODE_EXPIRY_DAYS:   z.coerce.number().default(30),
  VERIFICATION_CODE_TTL:   z.coerce.number().default(600),

  LOG_LEVEL:             z.string().default('info'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

const env = parsed.data

export const config = {
  nodeEnv:    env.NODE_ENV,
  isDev:      env.NODE_ENV === 'development',
  isProd:     env.NODE_ENV === 'production',
  port:       env.PORT,
  domain:      env.DOMAIN,
  adminDomain: env.ADMIN_DOMAIN || null,
  apiDomain:   env.API_DOMAIN   || null,
  appUrl:      env.APP_URL,
  jwtSecret:  env.JWT_SECRET,
  jwtExpires: env.JWT_EXPIRES_IN,
  cookieSecret: env.COOKIE_SECRET || env.JWT_SECRET,
  // Вычисляем корневой домен для куки:
  // lk.example.com  → .example.com  (чтобы кука работала на admin.example.com тоже)
  // example.com     → .example.com
  // localhost        → undefined (не указываем domain)
  cookieDomain: (() => {
    const d = env.DOMAIN
    if (!d || d === 'localhost' || d.startsWith('127.') || d.startsWith('192.168.')) return undefined
    const parts = d.split('.')
    // берём последние два сегмента: example.com
    const root = parts.slice(-2).join('.')
    return `.${root}`
  })(),

  db: {
    url: env.DATABASE_URL,
  },

  redis: {
    url:      env.REDIS_URL,
    password: env.REDIS_PASSWORD,
  },

  remnawave: {
    url:             env.REMNAWAVE_URL,
    token:           env.REMNAWAVE_TOKEN ?? '',
    subscriptionUrl: env.REMNAWAVE_SUBSCRIPTION_URL || env.REMNAWAVE_URL,
    configured:      !!(env.REMNAWAVE_TOKEN),
  },

  telegram: {
    botToken:       env.TELEGRAM_BOT_TOKEN ?? '',
    botName:        env.TELEGRAM_BOT_NAME ?? '',
    loginBotToken:  env.TELEGRAM_LOGIN_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN || '',
    configured:     !!(env.TELEGRAM_BOT_TOKEN),
    // OIDC login (new flow). Empty clientId → endpoint returns 503 so the
    // frontend falls back to the legacy HMAC widget.
    loginClientId:     env.TELEGRAM_LOGIN_CLIENT_ID || '',
    loginClientSecret: env.TELEGRAM_LOGIN_CLIENT_SECRET || '',
    loginOidcEnabled:  !!env.TELEGRAM_LOGIN_CLIENT_ID,
  },

  yukassa: {
    shopId:        env.YUKASSA_SHOP_ID,
    secretKey:     env.YUKASSA_SECRET_KEY,
    returnUrl:     env.YUKASSA_RETURN_URL,
    webhookSecret: env.YUKASSA_WEBHOOK_SECRET,
    enabled:       !!(env.YUKASSA_SHOP_ID && env.YUKASSA_SECRET_KEY),
  },

  cryptopay: {
    apiToken: env.CRYPTOPAY_API_TOKEN,
    network:  env.CRYPTOPAY_NETWORK,
    enabled:  !!(env.CRYPTOPAY_API_TOKEN) && env.FEATURE_CRYPTO_PAYMENTS,
  },

  referral: {
    bonusDays:    env.REFERRAL_BONUS_DAYS,
    minDays:      env.REFERRAL_MIN_DAYS,
    enabled:      env.FEATURE_REFERRAL,
    rewardType:   env.REFERRAL_REWARD_TYPE,
    rewardAmount: env.REFERRAL_REWARD_AMOUNT,
  },

  smtp: {
    host:  env.SMTP_HOST,
    port:  env.SMTP_PORT,
    user:  env.SMTP_USER,
    pass:  env.SMTP_PASS,
    from:  env.SMTP_FROM || `noreply@${env.DOMAIN}`,
    configured: !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS),
  },

  features: {
    cryptoPayments: env.FEATURE_CRYPTO_PAYMENTS,
    referral:       env.FEATURE_REFERRAL,
    emailAuth:      env.FEATURE_EMAIL_AUTH,
    telegramAuth:   env.FEATURE_TELEGRAM_AUTH,
    trial:          env.FEATURE_TRIAL,
    trialDays:      env.TRIAL_DAYS,
    gifts:          env.FEATURE_GIFTS,
    balance:        env.FEATURE_BALANCE,
  },

  gifts: {
    codeExpiryDays: env.GIFT_CODE_EXPIRY_DAYS,
  },

  verification: {
    codeTtl: env.VERIFICATION_CODE_TTL,
  },

  logLevel: env.LOG_LEVEL,
}
