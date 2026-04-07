-- Add login failure tracking fields to PatientAuth
ALTER TABLE "PatientAuth" ADD COLUMN "loginLastFailedAt" TIMESTAMP(3);

-- Add last login IP tracking to Patient
ALTER TABLE "Patient" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN "lastLoginIp" TEXT;
