/**
 * Vitest global setup — provides Jest compatibility shim
 * so tests using jest.fn(), jest.mock(), etc. work with Vitest.
 */
import { vi } from "vitest";

// Make `jest` globally available as an alias for `vi`
// This allows tests written with Jest APIs to work in Vitest
(globalThis as any).jest = vi;
