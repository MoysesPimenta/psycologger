-- Patient Portal: new enums, models, and tenant feature flags
-- Migration: 20260403_patient_portal

-- New enums
CREATE TYPE "JournalEntryType" AS ENUM ('MOOD_CHECKIN', 'REFLECTION', 'SESSION_PREP', 'QUESTION', 'IMPORTANT_EVENT', 'GRATITUDE');
CREATE TYPE "JournalVisibility" AS ENUM ('PRIVATE', 'SHARED', 'DRAFT');
CREATE TYPE "PatientNotificationType" AS ENUM ('SESSION_REMINDER', 'PAYMENT_REMINDER', 'PRE_SESSION_PROMPT', 'ENTRY_REVIEWED', 'GENERAL');
CREATE TYPE "ConsentType" AS ENUM ('TERMS_OF_USE', 'PRIVACY_POLICY', 'DATA_SHARING', 'JOURNAL_SHARING');

-- Tenant portal feature flags
ALTER TABLE "Tenant" ADD COLUMN "portalEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "portalPaymentsVisible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "portalJournalEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Tenant" ADD COLUMN "portalRescheduleEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "portalVideoLinkAdvanceMin" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Tenant" ADD COLUMN "portalSafetyText" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "portalSafetyCrisisPhone" TEXT;

-- PatientAuth
CREATE TABLE "PatientAuth" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "loginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "activationToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientAuth_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientAuth_activationToken_key" ON "PatientAuth"("activationToken");
CREATE UNIQUE INDEX "PatientAuth_patientId_key" ON "PatientAuth"("patientId");
CREATE UNIQUE INDEX "PatientAuth_tenantId_email_key" ON "PatientAuth"("tenantId", "email");
CREATE UNIQUE INDEX "PatientAuth_tenantId_patientId_key" ON "PatientAuth"("tenantId", "patientId");
CREATE INDEX "PatientAuth_tenantId_idx" ON "PatientAuth"("tenantId");
CREATE INDEX "PatientAuth_email_idx" ON "PatientAuth"("email");

ALTER TABLE "PatientAuth" ADD CONSTRAINT "PatientAuth_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientAuth" ADD CONSTRAINT "PatientAuth_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PatientPortalSession
CREATE TABLE "PatientPortalSession" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientAuthId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientPortalSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientPortalSession_tokenHash_key" ON "PatientPortalSession"("tokenHash");
CREATE INDEX "PatientPortalSession_patientAuthId_idx" ON "PatientPortalSession"("patientAuthId");
CREATE INDEX "PatientPortalSession_expiresAt_idx" ON "PatientPortalSession"("expiresAt");

ALTER TABLE "PatientPortalSession" ADD CONSTRAINT "PatientPortalSession_patientAuthId_fkey" FOREIGN KEY ("patientAuthId") REFERENCES "PatientAuth"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- PatientPreference
CREATE TABLE "PatientPreference" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "notifySessionReminder" BOOLEAN NOT NULL DEFAULT true,
    "notifyPaymentReminder" BOOLEAN NOT NULL DEFAULT true,
    "notifyPreSessionPrompt" BOOLEAN NOT NULL DEFAULT true,
    "reminderHoursBefore" INTEGER NOT NULL DEFAULT 24,
    "defaultJournalVisibility" "JournalVisibility" NOT NULL DEFAULT 'PRIVATE',
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "emergencyContactRelation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatientPreference_patientId_key" ON "PatientPreference"("patientId");
CREATE INDEX "PatientPreference_tenantId_idx" ON "PatientPreference"("tenantId");

ALTER TABLE "PatientPreference" ADD CONSTRAINT "PatientPreference_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientPreference" ADD CONSTRAINT "PatientPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- JournalEntry
CREATE TABLE "JournalEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "therapistId" UUID,
    "entryType" "JournalEntryType" NOT NULL,
    "visibility" "JournalVisibility" NOT NULL DEFAULT 'PRIVATE',
    "moodScore" INTEGER,
    "anxietyScore" INTEGER,
    "energyScore" INTEGER,
    "sleepScore" INTEGER,
    "emotionTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "noteText" TEXT,
    "discussNextSession" BOOLEAN NOT NULL DEFAULT false,
    "flaggedForSupport" BOOLEAN NOT NULL DEFAULT false,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "JournalEntry_tenantId_patientId_idx" ON "JournalEntry"("tenantId", "patientId");
CREATE INDEX "JournalEntry_tenantId_therapistId_visibility_idx" ON "JournalEntry"("tenantId", "therapistId", "visibility");
CREATE INDEX "JournalEntry_tenantId_patientId_createdAt_idx" ON "JournalEntry"("tenantId", "patientId", "createdAt");
CREATE INDEX "JournalEntry_tenantId_discussNextSession_idx" ON "JournalEntry"("tenantId", "discussNextSession");

ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PatientNotification
CREATE TABLE "PatientNotification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" "PatientNotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "relatedEntityType" TEXT,
    "relatedEntityId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PatientNotification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientNotification_tenantId_patientId_readAt_idx" ON "PatientNotification"("tenantId", "patientId", "readAt");
CREATE INDEX "PatientNotification_tenantId_patientId_createdAt_idx" ON "PatientNotification"("tenantId", "patientId", "createdAt");

ALTER TABLE "PatientNotification" ADD CONSTRAINT "PatientNotification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PatientNotification" ADD CONSTRAINT "PatientNotification_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ConsentRecord
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConsentRecord_tenantId_patientId_idx" ON "ConsentRecord"("tenantId", "patientId");
CREATE INDEX "ConsentRecord_tenantId_patientId_consentType_idx" ON "ConsentRecord"("tenantId", "patientId", "consentType");

ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
