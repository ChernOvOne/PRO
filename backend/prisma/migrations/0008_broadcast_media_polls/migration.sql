-- AlterTable: add media, parse mode, poll fields to broadcasts
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "tg_media_type" TEXT;
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "tg_media_url" TEXT;
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "tg_parse_mode" TEXT DEFAULT 'Markdown';

ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "tg_poll_question" TEXT;
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "tg_poll_options" JSONB;
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "tg_poll_anonymous" BOOLEAN DEFAULT true;
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "tg_poll_multiple" BOOLEAN DEFAULT false;
ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "tg_poll_id" TEXT;
