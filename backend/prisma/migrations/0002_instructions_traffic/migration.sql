-- Migration 0002: Instruction platforms/apps/steps + Tariff extensions

-- TariffType enum
CREATE TYPE "TariffType" AS ENUM ('SUBSCRIPTION', 'TRAFFIC_ADDON');

-- Extend Tariff table
ALTER TABLE "tariffs"
  ADD COLUMN IF NOT EXISTS "type"             "TariffType" NOT NULL DEFAULT 'SUBSCRIPTION',
  ADD COLUMN IF NOT EXISTS "traffic_strategy" TEXT         NOT NULL DEFAULT 'MONTH',
  ADD COLUMN IF NOT EXISTS "traffic_addon_gb" INTEGER,
  ADD COLUMN IF NOT EXISTS "remnawave_squads" TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "remnawave_tag"    TEXT;

-- InstructionPlatform
CREATE TABLE IF NOT EXISTS "instruction_platforms" (
  "id"         TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "slug"       TEXT    NOT NULL,
  "name"       TEXT    NOT NULL,
  "icon"       TEXT    NOT NULL DEFAULT '📱',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active"  BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_platforms_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "instruction_platforms_slug_key" ON "instruction_platforms"("slug");

-- InstructionApp
CREATE TABLE IF NOT EXISTS "instruction_apps" (
  "id"          TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "platform_id" TEXT    NOT NULL,
  "name"        TEXT    NOT NULL,
  "icon"        TEXT    NOT NULL DEFAULT '🔵',
  "is_featured" BOOLEAN NOT NULL DEFAULT false,
  "store_url"   TEXT,
  "deeplink"    TEXT,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_apps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_apps_platform_id_fkey"
    FOREIGN KEY ("platform_id") REFERENCES "instruction_platforms"("id") ON DELETE CASCADE
);

-- InstructionStep
CREATE TABLE IF NOT EXISTS "instruction_steps" (
  "id"        TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "app_id"    TEXT    NOT NULL,
  "order"     INTEGER NOT NULL,
  "text"      TEXT    NOT NULL,
  "image_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "instruction_steps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "instruction_steps_app_id_fkey"
    FOREIGN KEY ("app_id") REFERENCES "instruction_apps"("id") ON DELETE CASCADE
);

-- Seed default platforms
INSERT INTO "instruction_platforms" ("id", "slug", "name", "icon", "sort_order")
VALUES
  (gen_random_uuid()::text, 'ios',     'iOS',        '🍎', 1),
  (gen_random_uuid()::text, 'android', 'Android',    '🤖', 2),
  (gen_random_uuid()::text, 'windows', 'Windows',    '🪟', 3),
  (gen_random_uuid()::text, 'macos',   'macOS',      '💻', 4),
  (gen_random_uuid()::text, 'linux',   'Linux',      '🐧', 5),
  (gen_random_uuid()::text, 'tv',      'Android TV', '📺', 6)
ON CONFLICT ("slug") DO NOTHING;
