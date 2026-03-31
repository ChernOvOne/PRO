-- Add isVisible and isTrial to tariffs
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "is_visible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "tariffs" ADD COLUMN IF NOT EXISTS "is_trial" BOOLEAN NOT NULL DEFAULT false;
