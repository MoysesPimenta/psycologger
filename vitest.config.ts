import { defineConfig } from "vitest/config";
import path from "path";
import { randomBytes } from "crypto";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    env: {
      ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      NEXTAUTH_SECRET: "test-nextauth-secret-value-that-is-at-least-32-characters-long",
      CRON_SECRET: "test-cron-secret-minimum-16-chars",
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      RESEND_API_KEY: "re_test_1234567890",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
