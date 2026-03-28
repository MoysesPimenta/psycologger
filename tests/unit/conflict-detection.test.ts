/**
 * Unit tests — Appointment conflict detection
 */

describe("Appointment conflict detection", () => {
  function overlaps(
    a: { startsAt: Date; endsAt: Date },
    b: { startsAt: Date; endsAt: Date }
  ): boolean {
    return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
  }

  function makeAppt(startHour: number, endHour: number): { startsAt: Date; endsAt: Date } {
    const base = new Date("2026-03-27T00:00:00Z");
    return {
      startsAt: new Date(base.setHours(startHour, 0, 0, 0)),
      endsAt: new Date(new Date("2026-03-27T00:00:00Z").setHours(endHour, 0, 0, 0)),
    };
  }

  test("non-overlapping appointments have no conflict", () => {
    const a = makeAppt(9, 10);
    const b = makeAppt(10, 11);
    expect(overlaps(a, b)).toBe(false);
  });

  test("overlapping appointments conflict", () => {
    const a = makeAppt(9, 10);
    const b = makeAppt(9, 30, 10, 30);
    expect(overlaps(a, b)).toBe(true);
  });

  test("appointment B contained within A conflicts", () => {
    const a = makeAppt(9, 11);
    const b = makeAppt(9, 30, 10, 30);
    expect(overlaps(a, b)).toBe(true);
  });

  test("back-to-back appointments don't conflict", () => {
    const a = makeAppt(9, 10);
    const b = makeAppt(10, 11);
    expect(overlaps(a, b)).toBe(false);
  });
});

// Extended version with 4-param helper
function makeApptHM(sh: number, sm: number, eh: number, em: number) {
  const base = "2026-03-27T";
  return {
    startsAt: new Date(`${base}${String(sh).padStart(2,"0")}:${String(sm).padStart(2,"0")}:00Z`),
    endsAt: new Date(`${base}${String(eh).padStart(2,"0")}:${String(em).padStart(2,"0")}:00Z`),
  };
}

function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date }
): boolean {
  return a.startsAt < b.endsAt && a.endsAt > b.startsAt;
}

describe("Conflict detection — minute precision", () => {
  test("50-minute sessions back to back", () => {
    const a = makeApptHM(9, 0, 9, 50);
    const b = makeApptHM(9, 50, 10, 40);
    expect(overlaps(a, b)).toBe(false);
  });

  test("overlap by 1 minute is a conflict", () => {
    const a = makeApptHM(9, 0, 9, 51);
    const b = makeApptHM(9, 50, 10, 40);
    expect(overlaps(a, b)).toBe(true);
  });
});
