/**
 * Environment variable validation — Psycologger
 *
 * Validates critical environment variables at startup so the app fails
 * fast with a clear error message instead of crashing at runtime when
 * an env var is first accessed.
 *
 * Import this module in the root layout or instrumentation hook.
 */

export interface EnvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  requiredVarsSet: number;
  requiredVarsTotal: number;
  optionalVarsSet: number;
  optionalVarsTotal: number;
  missingVarNames: string[];
  invalidVarNames: string[];
  warningVarNames: string[];
}

interface EnvRule {
  name: string;
  required: boolean;
  /** Optional validator — return an error string if invalid, undefined if ok. */
  validate?: (value: string) => string | undefined;
  /** Optional warning validator — return a warning string if present, undefined if ok. */
  warn?: (value: string) => string | undefined;
}

const ENV_RULES: EnvRule[] = [
  // CRITICAL REQUIRED VARS
  {
    name: "DATABASE_URL",
    required: true,
  },
  {
    name: "ENCRYPTION_KEY",
    required: true,
    validate: (v) => {
      try {
        const buf = Buffer.from(v, "base64");
        if (buf.length < 32) return "ENCRYPTION_KEY must be at least 32 bytes (256-bit) when base64-decoded";
      } catch {
        return "ENCRYPTION_KEY must be a valid base64 string";
      }
      return undefined;
    },
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
  {
    name: "STRIPE_SECRET_KEY",
    required: true,
    validate: (v) => {
      if (!v.startsWith("sk_")) return "STRIPE_SECRET_KEY should start with 'sk_'";
      return undefined;
    },
  },
  {
    name: "STRIPE_WEBHOOK_SECRET",
    required: true,
    validate: (v) => {
      if (!v.startsWith("whsec_")) return "STRIPE_WEBHOOK_SECRET should start with 'whsec_'";
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
    name: "RESEND_WEBHOOK_SECRET",
    required: false,
    validate: (v) => {
      if (v && !v.startsWith("whsec_")) return "RESEND_WEBHOOK_SECRET should start with 'whsec_'";
      return undefined;
    },
  },
  {
    name: "CRON_SECRET",
    required: true,
    validate: (v) => {
      if (v.length < 16) return "CRON_SECRET must be at least 16 characters for security";
      return undefined;
    },
  },
  {
    name: "UPSTASH_REDIS_REST_URL",
    required: process.env.NODE_ENV === "production",
    validate: (v) => {
      if (!v.startsWith("https://")) return "UPSTASH_REDIS_REST_URL must be an https:// URL";
      return undefined;
    },
  },
  {
    name: "UPSTASH_REDIS_REST_TOKEN",
    required: process.env.NODE_ENV === "production",
    validate: (v) => {
      if (v.length < 10) return "UPSTASH_REDIS_REST_TOKEN appears to be too short";
      return undefined;
    },
  },

  // OPTIONAL VARS — recommended but not critical
  {
    name: "SENTRY_DSN",
    required: false,
    validate: (v) => {
      if (v && !v.match(/^https:\/\/.+@.+\.ingest(\.[a-z]+)?\.sentry\.io\/\d+$/)) {
        return "SENTRY_DSN should match format: https://...@...ingest[.region].sentry.io/...";
      }
      return undefined;
    },
  },
  {
    name: "NEXT_PUBLIC_SENTRY_DSN",
    required: false,
    validate: (v) => {
      if (v && !v.match(/^https:\/\/.+@.+\.ingest(\.[a-z]+)?\.sentry\.io\/\d+$/)) {
        return "NEXT_PUBLIC_SENTRY_DSN should match format: https://...@...ingest[.region].sentry.io/...";
      }
      return undefined;
    },
  },
  {
    name: "GOOGLE_CLIENT_ID",
    required: false,
  },
  {
    name: "GOOGLE_CLIENT_SECRET",
    required: false,
  },
  {
    name: "SUPABASE_URL",
    required: false,
    validate: (v) => {
      if (v && !v.startsWith("https://")) return "SUPABASE_URL must be an https:// URL";
      return undefined;
    },
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    required: false,
  },
  {
    name: "SENTRY_ORG",
    required: false,
  },
  {
    name: "SENTRY_PROJECT",
    required: false,
  },
  {
    name: "SENTRY_AUTH_TOKEN",
    required: false,
    warn: (v) => {
      // Warn if SENTRY_AUTH_TOKEN is set but ORG/PROJECT are missing
      if (v && (!process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT)) {
        return "SENTRY_AUTH_TOKEN is set but SENTRY_ORG or SENTRY_PROJECT is missing. Source map upload will be skipped.";
      }
      return undefined;
    },
  },
];

/**
 * Comprehensive validation of all environment variables.
 * Returns structured result with errors, warnings, and counts.
 * Does NOT log sensitive values — only names and validation status.
 */
export function validateAllEnvVars(): EnvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missingVarNames: string[] = [];
  const invalidVarNames: string[] = [];
  const warningVarNames: string[] = [];

  let requiredVarsSet = 0;
  let requiredVarsTotal = 0;
  let optionalVarsSet = 0;
  let optionalVarsTotal = 0;

  for (const rule of ENV_RULES) {
    const value = process.env[rule.name];
    const isSet = value && value.trim() !== "";

    if (rule.required) {
      requiredVarsTotal++;
      if (isSet) {
        requiredVarsSet++;
      }
    } else {
      optionalVarsTotal++;
      if (isSet) {
        optionalVarsSet++;
      }
    }

    // Check if required var is missing
    if (!isSet) {
      if (rule.required) {
        errors.push(`Missing required environment variable: ${rule.name}`);
        missingVarNames.push(rule.name);
      }
      continue;
    }

    // Validate the value if validator exists
    if (rule.validate) {
      const err = rule.validate(value);
      if (err) {
        errors.push(`Invalid ${rule.name}: ${err}`);
        invalidVarNames.push(rule.name);
      }
    }

    // Check warnings
    if (rule.warn) {
      const warn = rule.warn(value);
      if (warn) {
        warnings.push(`Warning for ${rule.name}: ${warn}`);
        warningVarNames.push(rule.name);
      }
    }
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    requiredVarsSet,
    requiredVarsTotal,
    optionalVarsSet,
    optionalVarsTotal,
    missingVarNames,
    invalidVarNames,
    warningVarNames,
  };
}

/**
 * Validate all critical environment variables.
 * Call once at startup. Throws if any required variable is missing or invalid.
 */
export function validateEnv(): void {
  const result = validateAllEnvVars();

  if (!result.valid) {
    const msg = [
      "╔══════════════════════════════════════════════════════════════╗",
      "║           ENVIRONMENT VALIDATION FAILED                      ║",
      "╚══════════════════════════════════════════════════════════════╝",
      "",
      ...result.errors.map((e) => `  ✗ ${e}`),
      "",
      "Fix the above issues before starting the application.",
    ].join("\n");

    console.error(msg);
    throw new Error(`Environment validation failed:\n${result.errors.join("\n")}`);
  }

  if (process.env.NODE_ENV !== "test") {
    const summary = `✓ Environment validated (${result.requiredVarsSet}/${result.requiredVarsTotal} required, ${result.optionalVarsSet}/${result.optionalVarsTotal} optional)`;
    console.log(summary);

    if (result.warnings.length > 0) {
      console.warn("\n⚠ Warnings:");
      result.warnings.forEach((w) => console.warn(`  ${w}`));
    }
  }
}
