-- Platform expansion migration
-- Most tables already exist, this adds missing columns and tables

-- CreateEnum (safe: skip if exists)
DO $$ BEGIN CREATE TYPE "PaymentPurpose" AS ENUM ('SUBSCRIPTION', 'TOPUP', 'GIFT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NewsType" AS ENUM ('NEWS', 'PROMOTION'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'SUCCESS', 'PROMO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "GiftStatus" AS ENUM ('PENDING', 'CLAIMED', 'EXPIRED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BalanceTransactionType" AS ENUM ('TOPUP', 'REFERRAL_REWARD', 'PURCHASE', 'GIFT', 'REFUND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReferralBonusType" AS ENUM ('DAYS', 'MONEY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EmailVerificationType" AS ENUM ('REGISTRATION', 'EMAIL_CHANGE', 'PASSWORD_RESET'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterEnum: Add BALANCE to PaymentProvider (safe)
DO $$ BEGIN ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'BALANCE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable: users - add missing columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "balance" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable: payments - add purpose
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "purpose" "PaymentPurpose" NOT NULL DEFAULT 'SUBSCRIPTION';

-- AlterTable: referral_bonuses - add bonus type fields
ALTER TABLE "referral_bonuses" ADD COLUMN IF NOT EXISTS "bonus_type" "ReferralBonusType" NOT NULL DEFAULT 'DAYS';
ALTER TABLE "referral_bonuses" ADD COLUMN IF NOT EXISTS "bonus_amount" DECIMAL(10,2);
ALTER TABLE "referral_bonuses" ADD COLUMN IF NOT EXISTS "bonus_currency" TEXT DEFAULT 'RUB';
ALTER TABLE "referral_bonuses" ALTER COLUMN "bonus_days" SET DEFAULT 0;

-- Ensure news and notifications tables exist for fresh installs
-- (on existing DBs these were created via `prisma db push` before 0003 was
-- written; this guard makes cold deploys work the same way).
CREATE TABLE IF NOT EXISTS "news" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- AlterTable: news - add missing columns
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "type" "NewsType" NOT NULL DEFAULT 'NEWS';
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "buttons" JSONB;
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "discount_code" TEXT;
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "discount_pct" DOUBLE PRECISION;
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "discount_abs" DOUBLE PRECISION;
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "tariff_ids" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "max_uses" INTEGER;
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "used_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "news" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);

-- AlterTable: notifications - add missing columns
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "link_url" TEXT;
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMP(3);

-- CreateTable: notification_reads (if not exists)
CREATE TABLE IF NOT EXISTS "notification_reads" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable: telegram_proxies (if not exists)
CREATE TABLE IF NOT EXISTS "telegram_proxies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tg_link" TEXT,
    "https_link" TEXT,
    "tag" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_proxies_pkey" PRIMARY KEY ("id")
);

-- CreateTable: email_verifications (if not exists)
CREATE TABLE IF NOT EXISTS "email_verifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "EmailVerificationType" NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "verified_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (safe: if not exists)
CREATE UNIQUE INDEX IF NOT EXISTS "news_discount_code_key" ON "news"("discount_code");
CREATE INDEX IF NOT EXISTS "news_is_active_published_at_idx" ON "news"("is_active", "published_at");
CREATE INDEX IF NOT EXISTS "news_type_idx" ON "news"("type");
CREATE INDEX IF NOT EXISTS "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");
CREATE UNIQUE INDEX IF NOT EXISTS "notification_reads_notification_id_user_id_key" ON "notification_reads"("notification_id", "user_id");
CREATE INDEX IF NOT EXISTS "telegram_proxies_is_active_sort_order_idx" ON "telegram_proxies"("is_active", "sort_order");
CREATE INDEX IF NOT EXISTS "email_verifications_email_code_idx" ON "email_verifications"("email", "code");
CREATE INDEX IF NOT EXISTS "email_verifications_user_id_type_idx" ON "email_verifications"("user_id", "type");
CREATE INDEX IF NOT EXISTS "email_verifications_expires_at_idx" ON "email_verifications"("expires_at");

-- AddForeignKey (safe: skip if exists)
DO $$ BEGIN ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "notification_reads" ADD CONSTRAINT "notification_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "email_verifications" ADD CONSTRAINT "email_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
