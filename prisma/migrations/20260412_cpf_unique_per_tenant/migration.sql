-- Drop the existing non-unique index
DROP INDEX IF EXISTS "Patient_tenantId_cpfBlindIndex_idx";

-- Create unique index to prevent duplicate CPFs within a tenant
-- NULLs are excluded (patients without CPF should not conflict)
CREATE UNIQUE INDEX "Patient_tenantId_cpfBlindIndex_key" ON "Patient"("tenantId", "cpfBlindIndex")
  WHERE "cpfBlindIndex" IS NOT NULL;
