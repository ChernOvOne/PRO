-- Drop old funnel columns (moved to funnel_steps)
-- Keep funnels table but remove message/channel fields

ALTER TABLE "funnels" DROP COLUMN IF EXISTS "delay_type";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "delay_value";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "delay_time";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "delay_weekdays";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "channel_tg";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "channel_email";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "channel_lk";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "tg_text";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "tg_buttons";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "tg_parse_mode";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "email_subject";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "email_html";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "email_btn_text";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "email_btn_url";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "email_template";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "lk_title";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "lk_message";
ALTER TABLE "funnels" DROP COLUMN IF EXISTS "lk_type";

-- Add step_order to funnel_logs
ALTER TABLE "funnel_logs" ADD COLUMN IF NOT EXISTS "step_order" INTEGER NOT NULL DEFAULT 0;
DROP INDEX IF EXISTS "funnel_logs_funnel_id_user_id_idx";
CREATE INDEX IF NOT EXISTS "funnel_logs_funnel_id_user_id_step_idx" ON "funnel_logs"("funnel_id", "user_id", "step_order");

-- Create funnel_steps table
CREATE TABLE IF NOT EXISTS "funnel_steps" (
    "id" TEXT NOT NULL,
    "funnel_id" TEXT NOT NULL,
    "step_order" INTEGER NOT NULL DEFAULT 0,
    "delay_type" TEXT NOT NULL DEFAULT 'immediate',
    "delay_value" INTEGER NOT NULL DEFAULT 0,
    "delay_time" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'none',
    "channel_tg" BOOLEAN NOT NULL DEFAULT false,
    "channel_email" BOOLEAN NOT NULL DEFAULT false,
    "channel_lk" BOOLEAN NOT NULL DEFAULT false,
    "tg_text" TEXT,
    "tg_buttons" JSONB,
    "tg_parse_mode" TEXT NOT NULL DEFAULT 'Markdown',
    "email_subject" TEXT,
    "email_html" TEXT,
    "email_btn_text" TEXT,
    "email_btn_url" TEXT,
    "email_template" TEXT NOT NULL DEFAULT 'dark',
    "lk_title" TEXT,
    "lk_message" TEXT,
    "lk_type" TEXT NOT NULL DEFAULT 'INFO',
    "action_type" TEXT NOT NULL DEFAULT 'none',
    "action_value" INTEGER NOT NULL DEFAULT 0,
    "action_promo_expiry" INTEGER NOT NULL DEFAULT 7,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "funnel_steps_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "funnel_steps_funnel_id_step_order_idx" ON "funnel_steps"("funnel_id", "step_order");
DO $$ BEGIN ALTER TABLE "funnel_steps" ADD CONSTRAINT "funnel_steps_funnel_id_fkey" FOREIGN KEY ("funnel_id") REFERENCES "funnels"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
