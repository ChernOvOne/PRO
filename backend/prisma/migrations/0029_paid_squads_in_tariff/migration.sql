-- Tariff: paid squads embedded + autorenew allowance flag
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "paid_squads" JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "auto_renew_allowed" BOOLEAN NOT NULL DEFAULT true;

-- User: rename auto_renew_addons → auto_renew + add last_auto_renew_at
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "auto_renew" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_auto_renew_at" TIMESTAMP(3);
-- Copy value from old column if it exists, then drop
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='auto_renew_addons') THEN
    UPDATE "users" SET "auto_renew" = "auto_renew_addons";
    ALTER TABLE "users" DROP COLUMN "auto_renew_addons";
  END IF;
END $$;

-- user_squad_addons: change schema to be self-contained
-- Since no user rows yet (verified) — safe to wipe and rebuild
TRUNCATE TABLE "user_squad_addons";
ALTER TABLE "user_squad_addons" DROP CONSTRAINT IF EXISTS "user_squad_addons_squad_addon_id_fkey";
ALTER TABLE "user_squad_addons" DROP CONSTRAINT IF EXISTS "user_squad_addons_user_id_squad_addon_id_key";
ALTER TABLE "user_squad_addons" DROP COLUMN IF EXISTS "squad_addon_id";
ALTER TABLE "user_squad_addons" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL DEFAULT 'Доп. сервер';
ALTER TABLE "user_squad_addons" ALTER COLUMN "title" DROP DEFAULT;
ALTER TABLE "user_squad_addons" ADD COLUMN IF NOT EXISTS "price_per_month_locked" DECIMAL(10,2) NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX IF NOT EXISTS "user_squad_addons_user_id_squad_uuid_key" ON "user_squad_addons"("user_id", "squad_uuid");

-- Drop the now-unused squad_addons table
DROP TABLE IF EXISTS "squad_addons";
