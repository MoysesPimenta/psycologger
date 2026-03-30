-- CreateTable
CREATE TABLE "PaymentReminderLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "chargeId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,

    CONSTRAINT "PaymentReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentReminderLog_tenantId_chargeId_idx" ON "PaymentReminderLog"("tenantId", "chargeId");

-- CreateIndex
CREATE INDEX "PaymentReminderLog_tenantId_type_sentAt_idx" ON "PaymentReminderLog"("tenantId", "type", "sentAt");

-- AddForeignKey
ALTER TABLE "PaymentReminderLog" ADD CONSTRAINT "PaymentReminderLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentReminderLog" ADD CONSTRAINT "PaymentReminderLog_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
