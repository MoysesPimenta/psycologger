-- Add Stripe SaaS billing to Tenant model
ALTER TABLE "Tenant" ADD COLUMN "planTier" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "Tenant" ADD COLUMN "stripeCustomerId" TEXT UNIQUE;
ALTER TABLE "Tenant" ADD COLUMN "stripeSubscriptionId" TEXT UNIQUE;
ALTER TABLE "Tenant" ADD COLUMN "subscriptionStatus" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "graceUntil" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "billingCurrency" TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE "Tenant" ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

-- Create StripeWebhookEvent model for idempotency
CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "StripeWebhookEvent_processedAt_idx" ON "StripeWebhookEvent"("processedAt");
