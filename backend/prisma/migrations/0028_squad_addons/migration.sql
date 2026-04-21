-- SQUAD_ADDON value for PaymentPurpose
ALTER TYPE "PaymentPurpose" ADD VALUE IF NOT EXISTS 'SQUAD_ADDON';

-- Relax Payment.tariff_id: nullable for TOPUP / SQUAD_ADDON / GIFT-with-no-tariff.
-- Safe because existing rows always had a value.
ALTER TABLE "payments" ALTER COLUMN "tariff_id" DROP NOT NULL;

-- UserSquadAddonSource enum
DO $$ BEGIN
  CREATE TYPE "UserSquadAddonSource" AS ENUM ('PURCHASE', 'BUNDLED', 'IMPORTED', 'GRANTED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Add auto_renew_addons flag to users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auto_renew_addons" BOOLEAN NOT NULL DEFAULT false;

-- squad_addons
CREATE TABLE IF NOT EXISTS "squad_addons" (
  "id"              TEXT PRIMARY KEY,
  "squad_uuid"      TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "country"         TEXT,
  "icon"            TEXT,
  "price_per_month" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "is_active"       BOOLEAN NOT NULL DEFAULT true,
  "sort_order"      INTEGER NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"      TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "squad_addons_squad_uuid_key" ON "squad_addons"("squad_uuid");

-- user_squad_addons
CREATE TABLE IF NOT EXISTS "user_squad_addons" (
  "id"                    TEXT PRIMARY KEY,
  "user_id"               TEXT NOT NULL,
  "squad_addon_id"        TEXT NOT NULL,
  "squad_uuid"            TEXT NOT NULL,
  "expire_at"             TIMESTAMP(3) NOT NULL,
  "price_per_day_locked"  DECIMAL(10,4) NOT NULL DEFAULT 0,
  "payment_id"            TEXT,
  "source"                "UserSquadAddonSource" NOT NULL DEFAULT 'PURCHASE',
  "auto_renew"            BOOLEAN NOT NULL DEFAULT true,
  "cancelled_at"          TIMESTAMP(3),
  "created_at"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_squad_addons_user_id_fkey"       FOREIGN KEY ("user_id")       REFERENCES "users"("id")        ON DELETE CASCADE,
  CONSTRAINT "user_squad_addons_squad_addon_id_fkey" FOREIGN KEY ("squad_addon_id") REFERENCES "squad_addons"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_squad_addons_user_id_squad_addon_id_key" ON "user_squad_addons"("user_id", "squad_addon_id");
CREATE INDEX IF NOT EXISTS "user_squad_addons_user_id_cancelled_at_idx" ON "user_squad_addons"("user_id", "cancelled_at");
CREATE INDEX IF NOT EXISTS "user_squad_addons_expire_at_idx" ON "user_squad_addons"("expire_at");
