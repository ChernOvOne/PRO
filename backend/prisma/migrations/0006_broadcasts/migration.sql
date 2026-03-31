-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BroadcastStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "broadcasts" (
  "id"               UUID            NOT NULL DEFAULT gen_random_uuid(),
  "channel"          TEXT            NOT NULL,
  "audience"         TEXT            NOT NULL,

  "tg_text"          TEXT,
  "tg_buttons"       JSONB,

  "email_subject"    TEXT,
  "email_html"       TEXT,
  "email_btn_text"   TEXT,
  "email_btn_url"    TEXT,

  "status"           "BroadcastStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduled_at"     TIMESTAMP(3),
  "started_at"       TIMESTAMP(3),
  "completed_at"     TIMESTAMP(3),

  "total_recipients" INTEGER         NOT NULL DEFAULT 0,
  "sent_count"       INTEGER         NOT NULL DEFAULT 0,
  "failed_count"     INTEGER         NOT NULL DEFAULT 0,

  "created_at"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMP(3)    NOT NULL,

  CONSTRAINT "broadcasts_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX IF NOT EXISTS "broadcasts_status_idx" ON "broadcasts" ("status");
CREATE INDEX IF NOT EXISTS "broadcasts_created_at_idx" ON "broadcasts" ("created_at" DESC);
