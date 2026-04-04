-- Add lastActivityAt to PatientPortalSession for idle timeout tracking
ALTER TABLE "PatientPortalSession" ADD COLUMN "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing sessions: set lastActivityAt = createdAt
UPDATE "PatientPortalSession" SET "lastActivityAt" = "createdAt" WHERE "lastActivityAt" = CURRENT_TIMESTAMP;
