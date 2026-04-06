/**
 * Environment variable validation — Psycologger
 *
 * Validates critical environment variables at startup so the app fails
 * fast with a clear error message instead of crashing at runtime when
 * an env var is first accessed.
 *
 * Import this module in the root layout or instrumentation hook.
 */

interface EnvRule {
  name: string;
  required: boolean;
  /** Optional validator — return an error string if invalid, undefined if ok. */
  validate?: (value: string) => string | undefined;
}

const ENV_RULES: EnvRule[] = [
  {
    name: "ENCRYPTION_KEY",
    required: true,
    validate: (v) => {
      try {
        const buf = Buffer.from(v, "base64");
        if (buf.length !== 32) return "ENCRYPTION_KEY must be 32 bytes (256-bit) when base64-decoded";
      } catch {
        return "ENCRYPTION_KEY must be a valid base64 string";
      }
      return undefined;
    },
  },
  {
    name: "CRON_SECRET",
    required: true,
    validate: (v) => {
      if (v.length < 16) return "CRON_SECRET should be at least 16 characters for security";
      return undefined;
    },
  },
  {
    name: "RESEND_API_KEY",
    required: true,
    validate: (v) => {
      if (!v.startsWith("re_")) return "RESEND_API_KEY should start with 're_'";
      return undefined;
    },
  },
  {
    name: "DATABASE_URL",
    required: true,
  },
  {
    name: "NEXTAUTH_SECRET",
    required: true,
    validate: (v) => {
      if (v.length < 32) return "NEXTAUTH_SECRET must be at least 32 characters (generate with: openssl rand -base64 32)";
      return undefined;
    },
  },
  {
    name: "NEXTAUTH_URL",
    required: process.env.NODE_ENV === "production",
  },
  // In production, Upstash Redis MUST back the rate limiter — the in-memory
  // fallback is per-instance on Vercel and renders documented limits useless.
  {
    name: "UPSTASH_REDIS_REST_URL",
    required: process.env.NODE_ENV === "production",
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    required: process.env.NODE_ENV === "production",
  },
];

/**
 * Validate all critical environment variables.
 * Call once at startup. Throws if any required variable is missing or invalid.
 */
export function validateEnv(): void {
  const errors: string[] = [];

  for (const rule of ENV_RULES) {
    const value = process.env[rule.name];

    if (!value || value.trim() === "") {
      if (rule.required) {
        errors.push(`Missing required environment variable: ${rule.name}`);
      }
      continue;
    }

    if (rule.validate) {
      const err = rule.validate(value);
      if (err) {
        errors.push(`Invalid ${rule.name}: ${err}`);
      }
    }
  }

  if (errors.length > 0) {
    const msg = [
      "╔══════════════════════════════════════════════════════════════╗",
      "║           ENVIRONMENT VALIDATION FAILED                      ║",
      "╚══════════════════════════════════════════════════════════════╝",
      "",
      ...errors.map((e) => `  ✗ ${e}`),
      "",
      "Fix the above issues before starting the application.",
    ].join("\n");

    console.error(msg);
    throw new Error(`Environment validation failed:\n${errors.join("\n")}`);
  }

  if (process.env.NODE_ENV !== "test") {
    console.log("✓ Environment variables validated successfully");
  }
}
