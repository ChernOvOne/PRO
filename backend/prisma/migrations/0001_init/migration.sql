-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED', 'TRIAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('YUKASSA', 'CRYPTOPAY', 'MANUAL');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('WINDOWS', 'MACOS', 'LINUX', 'IOS', 'ANDROID', 'ROUTER', 'OTHER');

-- CreateTable: users
CREATE TABLE "users" (
    "id"               TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "email"            TEXT,
    "telegram_id"      TEXT,
    "telegram_name"    TEXT,
    "password_hash"    TEXT,
    "remnawave_uuid"   TEXT,
    "sub_expire_at"    TIMESTAMP(3),
    "sub_status"       "SubStatus" NOT NULL DEFAULT 'INACTIVE',
    "sub_link"         TEXT,
    "role"             "Role" NOT NULL DEFAULT 'USER',
    "is_active"        BOOLEAN NOT NULL DEFAULT true,
    "referral_code"    TEXT NOT NULL,
    "referred_by_id"   TEXT,
    "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at"    TIMESTAMP(3),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable: sessions
CREATE TABLE "sessions" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"     TEXT NOT NULL,
    "token"       TEXT NOT NULL,
    "user_agent"  TEXT,
    "ip"          TEXT,
    "expires_at"  TIMESTAMP(3) NOT NULL,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: tariffs
CREATE TABLE "tariffs" (
    "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name"                TEXT NOT NULL,
    "description"         TEXT,
    "duration_days"       INTEGER NOT NULL,
    "price_rub"           DOUBLE PRECISION NOT NULL,
    "price_usdt"          DOUBLE PRECISION,
    "device_limit"        INTEGER NOT NULL DEFAULT 3,
    "traffic_gb"          INTEGER,
    "is_active"           BOOLEAN NOT NULL DEFAULT true,
    "is_featured"         BOOLEAN NOT NULL DEFAULT false,
    "sort_order"          INTEGER NOT NULL DEFAULT 0,
    "remnawave_tag_ids"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tariffs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: payments
CREATE TABLE "payments" (
    "id"                  TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"             TEXT NOT NULL,
    "tariff_id"           TEXT NOT NULL,
    "provider"            "PaymentProvider" NOT NULL,
    "provider_order_id"   TEXT,
    "amount"              DOUBLE PRECISION NOT NULL,
    "currency"            TEXT NOT NULL DEFAULT 'RUB',
    "status"              "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "yukassa_payment_id"  TEXT,
    "yukassa_status"      TEXT,
    "crypto_invoice_id"   INTEGER,
    "crypto_currency"     TEXT,
    "crypto_amount"       TEXT,
    "confirmed_at"        TIMESTAMP(3),
    "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable: referral_bonuses
CREATE TABLE "referral_bonuses" (
    "id"                        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "referrer_id"               TEXT NOT NULL,
    "triggered_by_payment_id"   TEXT NOT NULL,
    "bonus_days"                INTEGER NOT NULL,
    "applied_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "referral_bonuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable: instructions
CREATE TABLE "instructions" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "title"        TEXT NOT NULL,
    "device_type"  "DeviceType" NOT NULL,
    "content"      TEXT NOT NULL,
    "sort_order"   INTEGER NOT NULL DEFAULT 0,
    "is_active"    BOOLEAN NOT NULL DEFAULT true,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instructions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: settings
CREATE TABLE "settings" (
    "key"         TEXT NOT NULL,
    "value"       TEXT NOT NULL,
    "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable: import_records
CREATE TABLE "import_records" (
    "id"                   TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"              TEXT,
    "source_email"         TEXT,
    "source_telegram_id"   TEXT,
    "remnawave_uuid"       TEXT,
    "matched_by"           TEXT,
    "imported_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"               TEXT NOT NULL DEFAULT 'pending',
    CONSTRAINT "import_records_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
ALTER TABLE "users" ADD CONSTRAINT "users_email_key"          UNIQUE ("email");
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_id_key"    UNIQUE ("telegram_id");
ALTER TABLE "users" ADD CONSTRAINT "users_remnawave_uuid_key" UNIQUE ("remnawave_uuid");
ALTER TABLE "users" ADD CONSTRAINT "users_referral_code_key"  UNIQUE ("referral_code");
ALTER TABLE "sessions"         ADD CONSTRAINT "sessions_token_key"   UNIQUE ("token");
ALTER TABLE "referral_bonuses" ADD CONSTRAINT "referral_bonuses_triggered_by_payment_id_key" UNIQUE ("triggered_by_payment_id");
ALTER TABLE "import_records"   ADD CONSTRAINT "import_records_user_id_key" UNIQUE ("user_id");

-- Foreign keys
ALTER TABLE "users"            ADD CONSTRAINT "users_referred_by_id_fkey"
    FOREIGN KEY ("referred_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sessions"         ADD CONSTRAINT "sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payments"         ADD CONSTRAINT "payments_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments"         ADD CONSTRAINT "payments_tariff_id_fkey"
    FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_bonuses" ADD CONSTRAINT "referral_bonuses_referrer_id_fkey"
    FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "referral_bonuses" ADD CONSTRAINT "referral_bonuses_triggered_by_payment_id_fkey"
    FOREIGN KEY ("triggered_by_payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_records"   ADD CONSTRAINT "import_records_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Performance indexes
CREATE INDEX "users_email_idx"        ON "users"("email");
CREATE INDEX "users_telegram_id_idx"  ON "users"("telegram_id");
CREATE INDEX "users_sub_status_idx"   ON "users"("sub_status");
CREATE INDEX "users_sub_expire_at_idx" ON "users"("sub_expire_at");
CREATE INDEX "payments_user_id_idx"   ON "payments"("user_id");
CREATE INDEX "payments_status_idx"    ON "payments"("status");
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at" DESC);

-- Full text search on users
CREATE INDEX "users_search_idx" ON "users"
    USING gin(to_tsvector('simple', coalesce(email,'') || ' ' || coalesce(telegram_name,'')));
