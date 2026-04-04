/**
 * Unit tests for API pagination helpers — src/lib/api.ts
 */

import { parsePagination, buildMeta } from "@/lib/api";

describe("api pagination", () => {
  describe("parsePagination", () => {
    it("should return defaults for empty params", () => {
      const params = new URLSearchParams();
      const result = parsePagination(params);
      expect(result).toEqual({ page: 1, pageSize: 20, skip: 0 });
    });

    it("should parse page and pageSize", () => {
      const params = new URLSearchParams({ page: "3", pageSize: "50" });
      const result = parsePagination(params);
      expect(result).toEqual({ page: 3, pageSize: 50, skip: 100 });
    });

    it("should clamp page to minimum 1", () => {
      const params = new URLSearchParams({ page: "-5" });
      const result = parsePagination(params);
      expect(result.page).toBe(1);
    });

    it("should clamp pageSize to maximum 100", () => {
      const params = new URLSearchParams({ pageSize: "500" });
      const result = parsePagination(params);
      expect(result.pageSize).toBe(100);
    });

    it("should clamp pageSize to minimum 1", () => {
      const params = new URLSearchParams({ pageSize: "0" });
      const result = parsePagination(params);
      expect(result.pageSize).toBe(1);
    });

    it("should handle NaN gracefully", () => {
      const params = new URLSearchParams({ page: "abc", pageSize: "xyz" });
      const result = parsePagination(params);
      expect(result).toEqual({ page: 1, pageSize: 20, skip: 0 });
    });
  });

  describe("buildMeta", () => {
    it("should build correct meta for first page", () => {
      const meta = buildMeta(50, { page: 1, pageSize: 20 });
      expect(meta).toEqual({ page: 1, pageSize: 20, total: 50, hasMore: true });
    });

    it("should set hasMore false on last page", () => {
      const meta = buildMeta(50, { page: 3, pageSize: 20 });
      expect(meta.hasMore).toBe(false);
    });

    it("should handle exact page boundary", () => {
      const meta = buildMeta(40, { page: 2, pageSize: 20 });
      expect(meta.hasMore).toBe(false);
    });

    it("should handle empty results", () => {
      const meta = buildMeta(0, { page: 1, pageSize: 20 });
      expect(meta).toEqual({ page: 1, pageSize: 20, total: 0, hasMore: false });
    });
  });
});
