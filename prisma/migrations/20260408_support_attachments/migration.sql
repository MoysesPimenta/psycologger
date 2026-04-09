-- Encrypted attachments for inbound support emails.
-- Files are stored in Supabase Storage bucket "support-attachments" (private),
-- AES-256-GCM encrypted with the same ENCRYPTION_KEY used for clinical notes.
-- A row is created for every attachment Resend forwards; quarantined=true
-- means the MIME type is outside our render allowlist and the file is hidden
-- behind an explicit "Baixar anexo bloqueado" action.

CREATE TABLE IF NOT EXISTS "SupportAttachment" (
  "id"          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "messageId"   UUID NOT NULL,
  "filename"    TEXT NOT NULL,
  "mimeType"    TEXT NOT NULL,
  "sizeBytes"   INTEGER NOT NULL,
  "sha256"      TEXT NOT NULL,
  "storageKey"  TEXT NOT NULL,
  "quarantined" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportAttachment_messageId_fkey" FOREIGN KEY ("messageId")
    REFERENCES "SupportMessage"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SupportAttachment_messageId_idx" ON "SupportAttachment"("messageId");
CREATE INDEX IF NOT EXISTS "SupportAttachment_sha256_idx"    ON "SupportAttachment"("sha256");
