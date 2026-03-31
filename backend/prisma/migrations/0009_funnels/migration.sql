-- Funnels
CREATE TABLE IF NOT EXISTS "funnels" (
    "id" TEXT NOT NULL,
    "trigger_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "delay_type" TEXT NOT NULL DEFAULT 'immediate',
    "delay_value" INTEGER NOT NULL DEFAULT 0,
    "delay_time" TEXT,
    "delay_weekdays" JSONB,
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
    "is_custom" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "funnels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "funnels_trigger_id_key" ON "funnels"("trigger_id");

-- Funnel logs
CREATE TABLE IF NOT EXISTS "funnel_logs" (
    "id" TEXT NOT NULL,
    "funnel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "funnel_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "funnel_logs_funnel_id_user_id_idx" ON "funnel_logs"("funnel_id", "user_id");
CREATE INDEX IF NOT EXISTS "funnel_logs_user_id_created_at_idx" ON "funnel_logs"("user_id", "created_at" DESC);
DO $$ BEGIN ALTER TABLE "funnel_logs" ADD CONSTRAINT "funnel_logs_funnel_id_fkey" FOREIGN KEY ("funnel_id") REFERENCES "funnels"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
