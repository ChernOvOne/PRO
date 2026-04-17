-- Allow null payment_id (for invitee bonus on registration without a payment)
ALTER TABLE "referral_bonuses" ALTER COLUMN "triggered_by_payment_id" DROP NOT NULL;

-- Add bonus_reason column (INVITER / INVITEE / INVITER_L2)
ALTER TABLE "referral_bonuses" ADD COLUMN IF NOT EXISTS "bonus_reason" TEXT NOT NULL DEFAULT 'INVITER';

-- Drop old single-column unique, add composite unique
DROP INDEX IF EXISTS "referral_bonuses_triggered_by_payment_id_key";
CREATE UNIQUE INDEX IF NOT EXISTS "referral_bonuses_dedup_idx"
  ON "referral_bonuses"("triggered_by_payment_id", "referrer_id", "bonus_reason");
