-- CreateTable: JournalNote (therapist private annotations on journal entries)
CREATE TABLE "JournalNote" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "journalEntryId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "noteText" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalNote_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "JournalNote_journalEntryId_idx" ON "JournalNote"("journalEntryId");
CREATE INDEX "JournalNote_tenantId_authorId_idx" ON "JournalNote"("tenantId", "authorId");

-- Foreign keys
ALTER TABLE "JournalNote" ADD CONSTRAINT "JournalNote_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JournalNote" ADD CONSTRAINT "JournalNote_journalEntryId_fkey"
    FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JournalNote" ADD CONSTRAINT "JournalNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
