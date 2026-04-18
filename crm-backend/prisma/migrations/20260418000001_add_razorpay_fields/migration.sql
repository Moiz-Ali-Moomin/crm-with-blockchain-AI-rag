-- AlterTable: add Razorpay fields to billing_info
ALTER TABLE "billing_info"
  ADD COLUMN "razorpay_customer_id"     TEXT,
  ADD COLUMN "razorpay_subscription_id" TEXT,
  ADD COLUMN "razorpay_payment_id"      TEXT,
  ADD COLUMN "razorpay_order_id"        TEXT;

-- Unique constraints (nullable columns — only enforced when non-null)
CREATE UNIQUE INDEX "billing_info_razorpay_customer_id_key"
  ON "billing_info"("razorpay_customer_id")
  WHERE "razorpay_customer_id" IS NOT NULL;

CREATE UNIQUE INDEX "billing_info_razorpay_subscription_id_key"
  ON "billing_info"("razorpay_subscription_id")
  WHERE "razorpay_subscription_id" IS NOT NULL;
