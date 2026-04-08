/**
 * Unit tests for plan-limit enforcement.
 *
 * Guards the invariants fixed in commit 47aac85:
 *   1. countActivePatients uses isActive=true (NOT 90-day activity).
 *   2. assertCanAddPatient throws QuotaExceededError at the cap, passes below.
 *   3. Plans whose limit is Infinity short-circuit without querying.
 *   4. The error carries resource, current, limit, planTier so the API
 *      layer can render a useful 402 body.
 *   5. getTenantQuotaUsage reports overQuota=true for historical violators.
 *
 * The db module is mocked per-test via jest.mock so we never touch Postgres.
 */

// Mock the Prisma client BEFORE importing the module under test so the
// top-level `import { db } from "@/lib/db"` resolves to our stub.
jest.mock("@/lib/db", () => {
  const db = {
    tenant: { findUnique: jest.fn() },
    patient: { count: jest.fn() },
    membership: { count: jest.fn() },
  };
  return { db };
});

import {
  assertCanAddPatient,
  assertCanAddTherapist,
  countActivePatients,
  getTenantQuotaUsage,
  QuotaExceededError,
} from "@/lib/billing/limits";
import { db } from "@/lib/db";

type MockFn = jest.Mock;
const mockTenant = db.tenant.findUnique as unknown as MockFn;
const mockPatientCount = db.patient.count as unknown as MockFn;
const mockMembershipCount = db.membership.count as unknown as MockFn;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("billing/limits — countActivePatients", () => {
  it("filters on isActive=true only (not 90-day activity)", async () => {
    mockPatientCount.mockResolvedValue(7);

    const n = await countActivePatients("tenant-1");

    expect(n).toBe(7);
    // The regression that allowed the clinica-teste-dqs03 bypass was
    // a WHERE clause that required recent-activity joins. Lock it down.
    expect(mockPatientCount).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", isActive: true },
    });
  });
});

describe("billing/limits — assertCanAddPatient", () => {
  it("passes when under the cap", async () => {
    mockTenant.mockResolvedValue({ planTier: "FREE" });
    mockPatientCount.mockResolvedValue(2); // FREE cap is 3

    await expect(assertCanAddPatient("tenant-1")).resolves.toBeUndefined();
    expect(mockPatientCount).toHaveBeenCalledTimes(1);
  });

  it("throws QuotaExceededError exactly AT the cap", async () => {
    mockTenant.mockResolvedValue({ planTier: "FREE" });
    mockPatientCount.mockResolvedValue(3); // already at cap

    await expect(assertCanAddPatient("tenant-1")).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it("throws ABOVE the cap (historical over-quota tenants)", async () => {
    mockTenant.mockResolvedValue({ planTier: "FREE" });
    mockPatientCount.mockResolvedValue(4); // the real-world bug state

    await expect(assertCanAddPatient("tenant-1")).rejects.toMatchObject({
      name: "QuotaExceededError",
      resource: "patient",
      current: 4,
      limit: 3,
      planTier: "FREE",
      status: 402,
      code: "QUOTA_EXCEEDED",
    });
  });

  it("short-circuits without counting when the plan is Infinity", async () => {
    mockTenant.mockResolvedValue({ planTier: "CLINIC" }); // maxActivePatients = Infinity

    await expect(assertCanAddPatient("tenant-1")).resolves.toBeUndefined();
    // Crucial: never queried the patient table.
    expect(mockPatientCount).not.toHaveBeenCalled();
  });

  it("throws a non-Quota error if the tenant does not exist", async () => {
    mockTenant.mockResolvedValue(null);

    await expect(assertCanAddPatient("ghost")).rejects.toThrow("Tenant not found");
    await expect(assertCanAddPatient("ghost")).rejects.not.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it("PRO cap is 25", async () => {
    mockTenant.mockResolvedValue({ planTier: "PRO" });
    mockPatientCount.mockResolvedValue(25);

    const err = await assertCanAddPatient("tenant-1").catch((e) => e);
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.limit).toBe(25);
    expect(err.planTier).toBe("PRO");
  });
});

describe("billing/limits — assertCanAddTherapist", () => {
  it("FREE allows exactly 1 seat", async () => {
    mockTenant.mockResolvedValue({ planTier: "FREE" });
    mockMembershipCount.mockResolvedValue(0);
    await expect(assertCanAddTherapist("tenant-1")).resolves.toBeUndefined();

    mockMembershipCount.mockResolvedValue(1);
    await expect(assertCanAddTherapist("tenant-1")).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it("CLINIC allows up to 5 seats then blocks", async () => {
    mockTenant.mockResolvedValue({ planTier: "CLINIC" });

    mockMembershipCount.mockResolvedValue(4);
    await expect(assertCanAddTherapist("tenant-1")).resolves.toBeUndefined();

    mockMembershipCount.mockResolvedValue(5);
    const err = await assertCanAddTherapist("tenant-1").catch((e) => e);
    expect(err).toBeInstanceOf(QuotaExceededError);
    expect(err.resource).toBe("therapist");
    expect(err.limit).toBe(5);
  });

  it("counts only PSYCHOLOGIST + ASSISTANT memberships with ACTIVE status", async () => {
    mockTenant.mockResolvedValue({ planTier: "FREE" });
    mockMembershipCount.mockResolvedValue(0);

    await assertCanAddTherapist("tenant-1");

    expect(mockMembershipCount).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        status: "ACTIVE",
        role: { in: ["PSYCHOLOGIST", "ASSISTANT"] },
      },
    });
  });
});

describe("billing/limits — getTenantQuotaUsage", () => {
  it("flags overQuota for historical violators (the dqs03 case)", async () => {
    mockTenant.mockResolvedValue({ planTier: "FREE" });
    // Simulate the buggy state: 4 patients on FREE plan.
    // countActivePatients (call 1) + countTherapistSeats (membership) +
    // countPatientsWithRecentActivity (call 2) all fire in parallel.
    mockPatientCount
      .mockResolvedValueOnce(4) // active patients
      .mockResolvedValueOnce(1); // recently engaged
    mockMembershipCount.mockResolvedValue(1);

    const usage = await getTenantQuotaUsage("tenant-1");

    expect(usage.planTier).toBe("FREE");
    expect(usage.patients.current).toBe(4);
    expect(usage.patients.limit).toBe(3);
    expect(usage.patients.overQuota).toBe(true);
    expect(usage.therapists.current).toBe(1);
    expect(usage.therapists.overQuota).toBe(false);
    expect(usage.engagement.patientsActive90d).toBe(1);
  });

  it("reports overQuota=false when fully under caps", async () => {
    mockTenant.mockResolvedValue({ planTier: "PRO" });
    mockPatientCount.mockResolvedValueOnce(10).mockResolvedValueOnce(8);
    mockMembershipCount.mockResolvedValue(1);

    const usage = await getTenantQuotaUsage("tenant-1");

    expect(usage.patients.overQuota).toBe(false);
    expect(usage.therapists.overQuota).toBe(false);
  });

  it("CLINIC patients.limit is Infinity and never flags overQuota", async () => {
    mockTenant.mockResolvedValue({ planTier: "CLINIC" });
    mockPatientCount.mockResolvedValueOnce(9999).mockResolvedValueOnce(500);
    mockMembershipCount.mockResolvedValue(3);

    const usage = await getTenantQuotaUsage("tenant-1");

    expect(usage.patients.limit).toBe(Infinity);
    expect(usage.patients.overQuota).toBe(false);
  });
});
