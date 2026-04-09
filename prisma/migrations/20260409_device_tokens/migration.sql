-- CreateEnum for push provider
CREATE TYPE "PushProvider" AS ENUM ('APNS', 'FCM', 'WEBPUSH');

-- CreateEnum for device platform
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID', 'WEB');

-- CreateTable DeviceToken
CREATE TABLE "DeviceToken" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "userId" UUID,
    "patientId" UUID,
    "platform" "DevicePlatform" NOT NULL,
    "token" TEXT NOT NULL,
    "pushProvider" "PushProvider" NOT NULL,
    "appVersion" TEXT,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex on token (unique)
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex for efficient filtering by user + revocation status
CREATE INDEX "DeviceToken_userId_revokedAt_idx" ON "DeviceToken"("userId", "revokedAt");

-- CreateIndex for efficient filtering by patient + revocation status
CREATE INDEX "DeviceToken_patientId_revokedAt_idx" ON "DeviceToken"("patientId", "revokedAt");

-- CreateIndex for efficient filtering by tenant + revocation status
CREATE INDEX "DeviceToken_tenantId_revokedAt_idx" ON "DeviceToken"("tenantId", "revokedAt");

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
