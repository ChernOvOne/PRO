-- AlterTable: Make Payment.userId optional
ALTER TABLE "payments" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable: Add externalHash to BuhTransaction
ALTER TABLE "buh_transactions" ADD COLUMN "external_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "buh_transactions_external_hash_key" ON "buh_transactions"("external_hash");
