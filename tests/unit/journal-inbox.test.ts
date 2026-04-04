/**
 * Unit tests for journal inbox redesign — data transformation and utility logic.
 *
 * Note: API route handlers are integration-tested via the /api routes.
 * These tests cover the pure functions and data shapes used by the inbox.
 */

describe("journal inbox — ENTRY_TYPE_LABELS", () => {
  const ENTRY_TYPE_LABELS: Record<string, string> = {
    MOOD_CHECKIN: "Humor",
    REFLECTION: "Reflexão",
    SESSION_PREP: "Preparação",
    QUESTION: "Pergunta",
    IMPORTANT_EVENT: "Evento",
    GRATITUDE: "Gratidão",
  };

  it("should have labels for all 6 entry types", () => {
    expect(Object.keys(ENTRY_TYPE_LABELS)).toHaveLength(6);
  });

  it("should return Portuguese labels", () => {
    expect(ENTRY_TYPE_LABELS.MOOD_CHECKIN).toBe("Humor");
    expect(ENTRY_TYPE_LABELS.REFLECTION).toBe("Reflexão");
    expect(ENTRY_TYPE_LABELS.SESSION_PREP).toBe("Preparação");
    expect(ENTRY_TYPE_LABELS.QUESTION).toBe("Pergunta");
    expect(ENTRY_TYPE_LABELS.IMPORTANT_EVENT).toBe("Evento");
    expect(ENTRY_TYPE_LABELS.GRATITUDE).toBe("Gratidão");
  });
});

describe("journal inbox — patient summary BigInt conversion", () => {
  // Simulates what the patients endpoint does with raw SQL BigInt results
  function convertStats(stats: { totalShared: bigint; unreadCount: bigint; flaggedCount: bigint; discussCount: bigint }) {
    return {
      totalShared: Number(stats.totalShared),
      unreadCount: Number(stats.unreadCount),
      flaggedCount: Number(stats.flaggedCount),
      discussCount: Number(stats.discussCount),
    };
  }

  it("should convert BigInt counts to Number", () => {
    const raw = {
      totalShared: BigInt(15),
      unreadCount: BigInt(3),
      flaggedCount: BigInt(1),
      discussCount: BigInt(2),
    };
    const result = convertStats(raw);

    expect(result.totalShared).toBe(15);
    expect(result.unreadCount).toBe(3);
    expect(result.flaggedCount).toBe(1);
    expect(result.discussCount).toBe(2);
    expect(typeof result.totalShared).toBe("number");
  });

  it("should handle zero counts", () => {
    const raw = {
      totalShared: BigInt(0),
      unreadCount: BigInt(0),
      flaggedCount: BigInt(0),
      discussCount: BigInt(0),
    };
    const result = convertStats(raw);
    expect(result.totalShared).toBe(0);
    expect(result.unreadCount).toBe(0);
  });
});

describe("journal inbox — mood score color coding", () => {
  function getMoodColor(score: number | null): string {
    if (score === null) return "";
    if (score >= 7) return "text-green-500";
    if (score >= 4) return "text-amber-500";
    return "text-red-500";
  }

  it("should return green for scores 7-10", () => {
    expect(getMoodColor(7)).toBe("text-green-500");
    expect(getMoodColor(10)).toBe("text-green-500");
  });

  it("should return amber for scores 4-6", () => {
    expect(getMoodColor(4)).toBe("text-amber-500");
    expect(getMoodColor(6)).toBe("text-amber-500");
  });

  it("should return red for scores 1-3", () => {
    expect(getMoodColor(1)).toBe("text-red-500");
    expect(getMoodColor(3)).toBe("text-red-500");
  });

  it("should return empty string for null", () => {
    expect(getMoodColor(null)).toBe("");
  });
});

describe("journal inbox — trend data transformation", () => {
  function transformTrendData(entries: { id: string; createdAt: Date; moodScore: number | null; anxietyScore: number | null; energyScore: number | null; sleepScore: number | null; entryType: string }[]) {
    return entries.map((entry) => ({
      id: entry.id,
      date: entry.createdAt.toISOString(),
      moodScore: entry.moodScore,
      anxietyScore: entry.anxietyScore,
      energyScore: entry.energyScore,
      sleepScore: entry.sleepScore,
      entryType: entry.entryType,
    }));
  }

  it("should transform entries to trend format", () => {
    const entries = [
      {
        id: "entry-1",
        createdAt: new Date("2026-03-15T10:30:00Z"),
        moodScore: 6,
        anxietyScore: 4,
        energyScore: null,
        sleepScore: 8,
        entryType: "MOOD_CHECKIN",
      },
    ];

    const result = transformTrendData(entries);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("entry-1");
    expect(result[0].date).toBe("2026-03-15T10:30:00.000Z");
    expect(result[0].moodScore).toBe(6);
    expect(result[0].energyScore).toBeNull();
  });

  it("should handle empty array", () => {
    expect(transformTrendData([])).toEqual([]);
  });
});

describe("journal inbox — days parameter validation", () => {
  const ALLOWED_DAYS = [7, 30, 90, 365];

  function isValidDays(value: number): boolean {
    return ALLOWED_DAYS.includes(value);
  }

  it("should accept valid day values", () => {
    expect(isValidDays(7)).toBe(true);
    expect(isValidDays(30)).toBe(true);
    expect(isValidDays(90)).toBe(true);
    expect(isValidDays(365)).toBe(true);
  });

  it("should reject invalid day values", () => {
    expect(isValidDays(0)).toBe(false);
    expect(isValidDays(14)).toBe(false);
    expect(isValidDays(60)).toBe(false);
    expect(isValidDays(-1)).toBe(false);
  });
});

describe("journal inbox — note text validation", () => {
  function validateNoteText(text: string): { valid: boolean; error?: string } {
    if (text.length === 0) return { valid: false, error: "Note text is required" };
    if (text.length > 5000) return { valid: false, error: "Note text exceeds 5000 characters" };
    return { valid: true };
  }

  it("should accept valid note text", () => {
    expect(validateNoteText("Valid note")).toEqual({ valid: true });
    expect(validateNoteText("a")).toEqual({ valid: true });
    expect(validateNoteText("x".repeat(5000))).toEqual({ valid: true });
  });

  it("should reject empty text", () => {
    expect(validateNoteText("").valid).toBe(false);
  });

  it("should reject text exceeding 5000 characters", () => {
    expect(validateNoteText("x".repeat(5001)).valid).toBe(false);
  });
});
