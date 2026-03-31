-- Migration: Add promo codes, gift subscriptions, admin notes, bonus days, tariff fields
-- All operations are idempotent (IF NOT EXISTS / IF EXISTS)

-- ── Users: new columns ──────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "bonus_days" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_ip" TEXT;

-- ── Tariffs: new columns ────────────────────────────────────
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "countries" TEXT;
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "protocol" TEXT;
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "speed" TEXT;
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "mode" TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "variants" JSONB;
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "configurator" JSONB;

-- ── Admin Notes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "admin_notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "admin_notes_user_id_created_at_idx" ON "admin_notes"("user_id", "created_at" DESC);
DO $$ BEGIN ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "admin_notes" ADD CONSTRAINT "admin_notes_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Gift Subscriptions ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS "gift_subscriptions" (
    "id" TEXT NOT NULL,
    "gift_code" TEXT NOT NULL,
    "from_user_id" TEXT NOT NULL,
    "tariff_id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "recipient_user_id" TEXT,
    "recipient_email" TEXT,
    "message" TEXT,
    "status" "GiftStatus" NOT NULL DEFAULT 'PENDING',
    "claimed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gift_subscriptions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "gift_subscriptions_gift_code_key" ON "gift_subscriptions"("gift_code");
CREATE UNIQUE INDEX IF NOT EXISTS "gift_subscriptions_payment_id_key" ON "gift_subscriptions"("payment_id");
CREATE INDEX IF NOT EXISTS "gift_subscriptions_gift_code_idx" ON "gift_subscriptions"("gift_code");
CREATE INDEX IF NOT EXISTS "gift_subscriptions_from_user_id_idx" ON "gift_subscriptions"("from_user_id");
CREATE INDEX IF NOT EXISTS "gift_subscriptions_recipient_user_id_idx" ON "gift_subscriptions"("recipient_user_id");
CREATE INDEX IF NOT EXISTS "gift_subscriptions_status_idx" ON "gift_subscriptions"("status");
DO $$ BEGIN ALTER TABLE "gift_subscriptions" ADD CONSTRAINT "gift_subscriptions_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "gift_subscriptions" ADD CONSTRAINT "gift_subscriptions_tariff_id_fkey" FOREIGN KEY ("tariff_id") REFERENCES "tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "gift_subscriptions" ADD CONSTRAINT "gift_subscriptions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "gift_subscriptions" ADD CONSTRAINT "gift_subscriptions_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Balance Transactions ────────────────────────────────────
CREATE TABLE IF NOT EXISTS "balance_transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" "BalanceTransactionType" NOT NULL,
    "description" TEXT,
    "payment_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "balance_transactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "balance_transactions_user_id_created_at_idx" ON "balance_transactions"("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "balance_transactions_type_idx" ON "balance_transactions"("type");
DO $$ BEGIN ALTER TABLE "balance_transactions" ADD CONSTRAINT "balance_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "balance_transactions" ADD CONSTRAINT "balance_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Instruction Platforms ───────────────────────────────────
CREATE TABLE IF NOT EXISTS "instruction_platforms" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '📱',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instruction_platforms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "instruction_platforms_slug_key" ON "instruction_platforms"("slug");

-- ── Instruction Apps ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "instruction_apps" (
    "id" TEXT NOT NULL,
    "platform_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '🔵',
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "store_url" TEXT,
    "deeplink" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instruction_apps_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN ALTER TABLE "instruction_apps" ADD CONSTRAINT "instruction_apps_platform_id_fkey" FOREIGN KEY ("platform_id") REFERENCES "instruction_platforms"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Instruction Steps ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "instruction_steps" (
    "id" TEXT NOT NULL,
    "app_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "image_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "instruction_steps_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN ALTER TABLE "instruction_steps" ADD CONSTRAINT "instruction_steps_app_id_fkey" FOREIGN KEY ("app_id") REFERENCES "instruction_apps"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Promo Codes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "promo_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'bonus_days',
    "bonus_days" INTEGER,
    "discount_pct" INTEGER,
    "tariff_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "balance_amount" DOUBLE PRECISION,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "max_uses_per_user" INTEGER NOT NULL DEFAULT 1,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_codes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "promo_codes_code_key" ON "promo_codes"("code");

-- ── Promo Usages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "promo_usages" (
    "id" TEXT NOT NULL,
    "promo_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_usages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "promo_usages_promo_id_user_id_key" ON "promo_usages"("promo_id", "user_id");
DO $$ BEGIN ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promo_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "promo_usages" ADD CONSTRAINT "promo_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Settings table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- ── Add MANUAL to PaymentProvider if missing ─────────────────
DO $$ BEGIN ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'MANUAL'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
