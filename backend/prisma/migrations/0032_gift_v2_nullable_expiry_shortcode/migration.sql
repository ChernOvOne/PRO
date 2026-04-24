-- Gift v2: allow indefinite lifetime (nullable expires_at) and add a short
-- human-typeable code (shortCode) redeemable via the promo-input field.

ALTER TABLE "gift_subscriptions" ALTER COLUMN "expires_at" DROP NOT NULL;

ALTER TABLE "gift_subscriptions" ADD COLUMN IF NOT EXISTS "short_code" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "gift_subscriptions_short_code_key"
  ON "gift_subscriptions" ("short_code");

CREATE INDEX IF NOT EXISTS "gift_subscriptions_short_code_idx"
  ON "gift_subscriptions" ("short_code");
