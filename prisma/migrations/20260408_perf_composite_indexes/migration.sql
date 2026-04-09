-- Composite indexes for hot tenant-scoped queries (Batch 4).
-- Safe for production: uses CREATE INDEX CONCURRENTLY to avoid table locks.

-- Appointment: (tenantId, patientId, startsAt) for patient schedule views
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Appointment_tenantId_patientId_startsAt_idx" ON "Appointment"("tenantId", "patientId", "startsAt");

-- ClinicalSession: (tenantId, patientId, sessionDate) for patient session queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClinicalSession_tenantId_patientId_sessionDate_idx" ON "ClinicalSession"("tenantId", "patientId", "sessionDate");

-- ReminderLog: (tenantId, createdAt) for audit and purge queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ReminderLog_tenantId_createdAt_idx" ON "ReminderLog"("tenantId", "createdAt");

-- PaymentReminderLog: (tenantId, createdAt) for audit and retention queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "PaymentReminderLog_tenantId_createdAt_idx" ON "PaymentReminderLog"("tenantId", "createdAt");

-- AuditLog: (tenantId, action, createdAt) for forensics and time-range filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "AuditLog_tenantId_action_createdAt_idx" ON "AuditLog"("tenantId", "action", "createdAt");

-- SupportTicket: (status, lastMessageAt) for support dashboard filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS "SupportTicket_status_lastMessageAt_idx" ON "SupportTicket"("status", "lastMessageAt");

-- Membership: (userId, status) for user-scoped membership queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Membership_userId_status_idx" ON "Membership"("userId", "status");
