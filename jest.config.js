/** @type {import('jest').Config} */
const config = {
  // Uses sucrase (already installed via Next.js) to transform TypeScript.
  // No @swc/jest or @babel/preset-typescript needed.
  testEnvironment: "node",
  // Set required env vars before module-level code executes
  setupFiles: ["<rootDir>/tests/jest.env-setup.js"],
  transform: {
    "^.+\\.(ts|tsx|js|jsx)$": "<rootDir>/jest.esbuild-transform.js",
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/dist/", "/.vercel/"],
  coveragePathIgnorePatterns: ["/node_modules/", "/.next/", "/dist/", "/.vercel/"],
  watchPathIgnorePatterns: ["/node_modules/", "/.next/"],
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.ts",
    "<rootDir>/tests/integration/**/*.test.ts",
  ],
  // Run unit and integration separately via CLI flags:
  //   npm run test:unit        → runs tests/unit/**
  //   npm run test:integration → runs tests/integration/** (needs DB)
  //   npm run test:e2e         → runs playwright (needs app running)
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "!src/**/*.d.ts",
  ],
  coverageReporters: ["text", "lcov"],
  // Timeout for integration tests that hit the DB
  testTimeout: 30_000,
};

module.exports = config;
