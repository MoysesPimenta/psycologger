-- Per-user theme preference for clinic + patient portal.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "themePreference" TEXT NOT NULL DEFAULT 'system';
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "themePreference" TEXT NOT NULL DEFAULT 'system';
