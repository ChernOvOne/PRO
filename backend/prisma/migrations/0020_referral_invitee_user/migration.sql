ALTER TABLE "referral_bonuses" ADD COLUMN IF NOT EXISTS "invitee_user_id" TEXT;
CREATE INDEX IF NOT EXISTS "referral_bonuses_referrer_invitee_idx" ON "referral_bonuses"("referrer_id","invitee_user_id","bonus_reason");
