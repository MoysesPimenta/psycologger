-- Add HMAC-SHA256 blind index column for searchable CPF encryption.
-- The plaintext `cpf` column is now encrypted at rest via encryptCpf();
-- this column stores the deterministic HMAC so we can look up patients by
-- CPF without ever decrypting. Backfill is handled by the
-- /api/v1/cron/encrypt-cpfs cron.
ALTER TABLE "Patient" ADD COLUMN "cpfBlindIndex" TEXT;
CREATE INDEX "Patient_tenantId_cpfBlindIndex_idx" ON "Patient"("tenantId", "cpfBlindIndex");
