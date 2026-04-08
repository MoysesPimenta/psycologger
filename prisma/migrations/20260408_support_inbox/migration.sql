-- Support inbox (SA-only) — inbound + outbound email tickets.
-- Unscoped by tenant on purpose; accessed only from /sa/* routes.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportTicketStatus') THEN
    CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportMessageDirection') THEN
    CREATE TYPE "SupportMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportBlocklistKind') THEN
    CREATE TYPE "SupportBlocklistKind" AS ENUM ('EMAIL', 'DOMAIN');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          UUID,
  "userId"            UUID,
  "fromEmail"         TEXT NOT NULL,
  "fromName"          TEXT,
  "subject"           TEXT NOT NULL,
  "subjectNormalized" TEXT NOT NULL,
  "status"            "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "lastMessageAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx"       ON "SupportTicket"("status");
CREATE INDEX IF NOT EXISTS "SupportTicket_fromEmail_idx"    ON "SupportTicket"("fromEmail");
CREATE INDEX IF NOT EXISTS "SupportTicket_tenantId_idx"     ON "SupportTicket"("tenantId");
CREATE INDEX IF NOT EXISTS "SupportTicket_lastMessageAt_idx" ON "SupportTicket"("lastMessageAt");

CREATE TABLE IF NOT EXISTS "SupportMessage" (
  "id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "ticketId"        UUID NOT NULL,
  "direction"       "SupportMessageDirection" NOT NULL,
  "bodyEncrypted"   TEXT NOT NULL,
  "emailMessageId"  TEXT,
  "resendMessageId" TEXT,
  "senderUserId"    UUID,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_ticketId_fkey" FOREIGN KEY ("ticketId")
    REFERENCES "SupportTicket"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "SupportMessage_ticketId_idx"  ON "SupportMessage"("ticketId");
CREATE INDEX IF NOT EXISTS "SupportMessage_createdAt_idx" ON "SupportMessage"("createdAt");

CREATE TABLE IF NOT EXISTS "SupportBlocklist" (
  "id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind"      "SupportBlocklistKind" NOT NULL,
  "pattern"   TEXT NOT NULL,
  "reason"    TEXT,
  "createdBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportBlocklist_kind_pattern_key" UNIQUE ("kind", "pattern")
);
