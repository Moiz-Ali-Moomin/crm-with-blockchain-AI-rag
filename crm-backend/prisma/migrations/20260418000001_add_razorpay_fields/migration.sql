-- AlterTable: add Razorpay fields to billing_info
ALTER TABLE "billing_info"
  ADD COLUMN "razorpayCustomerId"     TEXT,
  ADD COLUMN "razorpaySubscriptionId" TEXT,
  ADD COLUMN "razorpayPaymentId"      TEXT,
  ADD COLUMN "razorpayOrderId"        TEXT;

CREATE UNIQUE INDEX "billing_info_razorpayCustomerId_key"
  ON "billing_info"("razorpayCustomerId");

CREATE UNIQUE INDEX "billing_info_razorpaySubscriptionId_key"
  ON "billing_info"("razorpaySubscriptionId");
