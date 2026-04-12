-- AlterEnum: Add PARTIAL_REFUND to PaymentStatus
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'PARTIAL_REFUND';

-- AlterTable: Add refund fields to payments
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refund_amount" DECIMAL(10, 2);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "refunded_at" TIMESTAMP;
