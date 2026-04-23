-- AlterTable: Make Payment.userId optional
ALTER TABLE "payments" ALTER COLUMN "user_id" DROP NOT NULL;

-- Ensure buh_transactions table + its enum exist for fresh installs (same
-- reason as news/notifications in 0003 — historically created via `db push`).
DO $$ BEGIN CREATE TYPE "BuhTransactionType" AS ENUM ('INCOME', 'EXPENSE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "buh_transactions" (
    "id" TEXT NOT NULL,
    "type" "BuhTransactionType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "category_id" TEXT,
    "description" TEXT,
    "receipt_url" TEXT,
    "receipt_file" TEXT,
    "is_historical" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "customer_id" TEXT,
    "source" TEXT DEFAULT 'web',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "buh_transactions_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add externalHash to BuhTransaction
ALTER TABLE "buh_transactions" ADD COLUMN IF NOT EXISTS "external_hash" TEXT;

-- CreateIndex
DO $$ BEGIN CREATE UNIQUE INDEX "buh_transactions_external_hash_key" ON "buh_transactions"("external_hash"); EXCEPTION WHEN duplicate_table THEN NULL; END $$;
