import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV:              z.enum(['development', 'production', 'test']).default('production'),
  PORT:                  z.coerce.number().default(4000),
  DOMAIN:                z.string().default('localhost'),
  APP_URL:               z.string().default('http://localhost:3000'),
  JWT_SECRET:            z.string().min(32),
  JWT_EXPIRES_IN:        z.string().default('30d'),
  COOKIE_SECRET:         z.string().min(1).optional(),

  DATABASE_URL:          z.string(),
  REDIS_URL:             z.string(),
  REDIS_PASSWORD:        z.string().optional(),

  REMNAWAVE_URL:         z.string().url(),
  REMNAWAVE_TOKEN:       z.string(),
  REMNAWAVE_SUBSCRIPTION_URL: z.string().optional(),

  TELEGRAM_BOT_TOKEN:    z.string(),
  TELEGRAM_BOT_NAME:     z.string(),
  TELEGRAM_LOGIN_BOT_TOKEN: z.string().optional(),

  YUKASSA_SHOP_ID:       z.string().optional(),
  YUKASSA_SECRET_KEY:    z.string().optional(),
  YUKASSA_RETURN_URL:    z.string().optional(),
  YUKASSA_WEBHOOK_SECRET: z.string().optional(),

  CRYPTOPAY_API_TOKEN:   z.string().optional(),
  CRYPTOPAY_NETWORK:     z.enum(['mainnet', 'testnet']).default('mainnet'),

  REFERRAL_BONUS_DAYS:   z.coerce.number().default(30),
  REFERRAL_MIN_DAYS:     z.coerce.number().default(30),

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
  domain:     env.DOMAIN,
  appUrl:     env.APP_URL,
  jwtSecret:  env.JWT_SECRET,
  jwtExpires: env.JWT_EXPIRES_IN,
  cookieSecret: env.COOKIE_SECRET || env.JWT_SECRET,

  db: {
    url: env.DATABASE_URL,
  },

  redis: {
    url:      env.REDIS_URL,
    password: env.REDIS_PASSWORD,
  },

  remnawave: {
    url:             env.REMNAWAVE_URL,
    token:           env.REMNAWAVE_TOKEN,
    subscriptionUrl: env.REMNAWAVE_SUBSCRIPTION_URL || env.REMNAWAVE_URL,
  },

  telegram: {
    botToken:       env.TELEGRAM_BOT_TOKEN,
    botName:        env.TELEGRAM_BOT_NAME,
    loginBotToken:  env.TELEGRAM_LOGIN_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN,
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
    bonusDays: env.REFERRAL_BONUS_DAYS,
    minDays:   env.REFERRAL_MIN_DAYS,
    enabled:   env.FEATURE_REFERRAL,
  },

  smtp: {
    host:  env.SMTP_HOST,
    port:  env.SMTP_PORT,
    user:  env.SMTP_USER,
    pass:  env.SMTP_PASS,
    from:  env.SMTP_FROM || `noreply@${env.DOMAIN}`,
  },

  features: {
    cryptoPayments: env.FEATURE_CRYPTO_PAYMENTS,
    referral:       env.FEATURE_REFERRAL,
    emailAuth:      env.FEATURE_EMAIL_AUTH,
    telegramAuth:   env.FEATURE_TELEGRAM_AUTH,
    trial:          env.FEATURE_TRIAL,
    trialDays:      env.TRIAL_DAYS,
  },

  logLevel: env.LOG_LEVEL,
}
