/**
 * LGPD Compliance — Brazilian data retention and deletion policies.
 *
 * LGPD (Lei Geral de Proteção de Dados) requires data minimization and
 * retention limits. This module defines the retention periods and helpers
 * for purging tenant data when tenants are suspended/cancelled.
 */

/**
 * Tenant data retention after cancellation (in days).
 * After a tenant is marked CANCELLED for this period, all tenant-scoped data
 * is eligible for hard deletion via the LGPD purge cron.
 */
export const LGPD_TENANT_RETENTION_DAYS = 90;

/**
 * Compute the cutoff date for tenant purge.
 * Returns the date before which tenant cancellations are eligible for deletion.
 */
export function computeTenantPurgeCutoff(now: Date = new Date()): Date {
  const ms = LGPD_TENANT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return new Date(now.getTime() - ms);
}
