/**
 * Unit tests — Appointment conflict detection
 *
 * Tests the overlap logic used in /api/v1/appointments (POST + PATCH).
 * The DB query is:
 *   AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }]
 * We replicate that logic here to thoroughly test all edge cases.
 */

function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date }
): boolean {
  // Replicates the Prisma WHERE clause used in checkConflict():
  //   a.startsAt < b.endsAt  AND  a.endsAt > b.startsAt
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

/** Build an appointment using hour+minute precision to avoid Date mutation bugs */
function appt(
  startHour: number,
  startMin: number,
  endHour: number,
  endMin: number
): { startsAt: Date; endsAt: Date } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const base = "2026-03-27T";
  return {
    startsAt: new Date(`${base}${pad(startHour)}:${pad(startMin)}:00Z`),
    endsAt:   new Date(`${base}${pad(endHour)}:${pad(endMin)}:00Z`),
  };
}

describe("Appointment conflict detection", () => {
  test("identical appointments conflict", () => {
    expect(overlaps(appt(9, 0, 10, 0), appt(9, 0, 10, 0))).toBe(true);
  });

  test("back-to-back (A ends when B starts) does NOT conflict", () => {
    expect(overlaps(appt(9, 0, 10, 0), appt(10, 0, 11, 0))).toBe(false);
  });

  test("50-minute sessions back to back do NOT conflict", () => {
    expect(overlaps(appt(9, 0, 9, 50), appt(9, 50, 10, 40))).toBe(false);
  });

  test("1-minute gap does NOT conflict", () => {
    expect(overlaps(appt(9, 0, 9, 50), appt(9, 51, 10, 41))).toBe(false);
  });

  test("overlap by 1 minute IS a conflict", () => {
    expect(overlaps(appt(9, 0, 9, 51), appt(9, 50, 10, 40))).toBe(true);
  });

  test("B fully contained within A is a conflict", () => {
    expect(overlaps(appt(9, 0, 11, 0), appt(9, 30, 10, 30))).toBe(true);
  });

  test("A fully contained within B is a conflict", () => {
    expect(overlaps(appt(9, 30, 10, 30), appt(9, 0, 11, 0))).toBe(true);
  });

  test("partial overlap (A starts before B ends) is a conflict", () => {
    expect(overlaps(appt(8, 30, 9, 30), appt(9, 0, 10, 0))).toBe(true);
  });

  test("partial overlap (B starts before A ends) is a conflict", () => {
    expect(overlaps(appt(9, 0, 10, 0), appt(8, 30, 9, 30))).toBe(true);
  });

  test("completely before does NOT conflict", () => {
    expect(overlaps(appt(8, 0, 9, 0), appt(10, 0, 11, 0))).toBe(false);
  });

  test("completely after does NOT conflict", () => {
    expect(overlaps(appt(14, 0, 15, 0), appt(9, 0, 10, 0))).toBe(false);
  });

  test("standard clinic day: 8 consecutive 50-min sessions, none conflict with each other", () => {
    const sessions = [
      appt(8,  0,  8, 50),
      appt(9,  0,  9, 50),
      appt(10, 0, 10, 50),
      appt(11, 0, 11, 50),
      appt(14, 0, 14, 50),
      appt(15, 0, 15, 50),
      appt(16, 0, 16, 50),
      appt(17, 0, 17, 50),
    ];
    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        expect(overlaps(sessions[i], sessions[j])).toBe(false);
      }
    }
  });
});
