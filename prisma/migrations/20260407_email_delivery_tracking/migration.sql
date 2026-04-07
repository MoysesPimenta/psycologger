-- Add EmailReminder model for Resend webhook tracking

-- Create EmailReminder table
CREATE TABLE "EmailReminder" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "recipient" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "resendMessageId" TEXT,
  "lastEmailStatus" TEXT,
  "lastEmailStatusAt" TIMESTAMP(3),
  "relatedEntityType" TEXT,
  "relatedEntityId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailReminder_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraint
ALTER TABLE "EmailReminder" ADD CONSTRAINT "EmailReminder_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE;

-- Create indexes for efficient querying
CREATE INDEX "EmailReminder_tenantId_idx" ON "EmailReminder"("tenantId");
CREATE INDEX "EmailReminder_tenantId_lastEmailStatus_idx" ON "EmailReminder"("tenantId", "lastEmailStatus");
CREATE INDEX "EmailReminder_tenantId_createdAt_idx" ON "EmailReminder"("tenantId", "createdAt");
CREATE INDEX "EmailReminder_resendMessageId_idx" ON "EmailReminder"("resendMessageId");
