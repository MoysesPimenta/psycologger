/**
 * Unit tests — Storage service (src/lib/storage.ts)
 *
 * IMPORTANT: SUPABASE_URL and SUPABASE_SERVICE_KEY are captured as module-level
 * constants at import time. Tests that need different env values must use
 * vi.resetModules() + require() to re-import with new env.
 */

// Set env vars BEFORE import so module-level constants get proper values
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "test-service-key-123";

// Mock fetch globally
import { vi } from "vitest";

global.fetch = vi.fn();

describe("Storage service", () => {
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  beforeEach(async () => {
    mockFetch.mockReset();
    // Always ensure env vars are set for non-test-env tests
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-service-key-123";
    vi.resetModules();
  });

  // ─── Upload File ──────────────────────────────────────────────────────────

  describe("uploadFile", () => {
    test("uploads file with correct headers and body", async () => {
      const { uploadFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValueOnce(""),
      } as unknown as Response);

      const buffer = Buffer.from("test file content");
      const result = await uploadFile({
        buffer,
        fileName: "test.pdf",
        mimeType: "application/pdf",
        storageKey: "tenant-id/session-id/test-uuid.pdf",
      });

      expect(result).toBe("tenant-id/session-id/test-uuid.pdf");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.supabase.co/storage/v1/object/session-files/tenant-id/session-id/test-uuid.pdf",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-service-key-123",
            apikey: "test-service-key-123",
            "Content-Type": "application/pdf",
            "x-upsert": "true",
          },
          body: buffer,
        }
      );
    });

    test("returns the storageKey on success", async () => {
      const { uploadFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValueOnce(""),
      } as unknown as Response);

      const result = await uploadFile({
        buffer: Buffer.from("content"),
        fileName: "doc.pdf",
        mimeType: "application/pdf",
        storageKey: "t/s/doc.pdf",
      });

      expect(result).toBe("t/s/doc.pdf");
    });

    test("throws error when upload fails", async () => {
      const { uploadFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValueOnce("Unauthorized"),
      } as unknown as Response);

      await expect(
        uploadFile({
          buffer: Buffer.from("content"),
          fileName: "test.pdf",
          mimeType: "application/pdf",
          storageKey: "tenant/session/file.pdf",
        })
      ).rejects.toThrow("Storage upload failed");
    });

    test("includes status code in thrown error (without leaking response body)", async () => {
      const { uploadFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValueOnce("Internal server error"),
      } as unknown as Response);

      await expect(
        uploadFile({
          buffer: Buffer.from("content"),
          fileName: "test.pdf",
          mimeType: "application/pdf",
          storageKey: "tenant/session/file.pdf",
        })
      ).rejects.toThrow(/Storage upload failed: 500/);
    });

    test("rejects path traversal in storage key", async () => {
      const { uploadFile } = await import("@/lib/storage");
      await expect(
        uploadFile({
          buffer: Buffer.from("content"),
          fileName: "test.pdf",
          mimeType: "application/pdf",
          storageKey: "../../../etc/passwd",
        })
      ).rejects.toThrow(/path traversal/);
    });

    test("rejects storage keys starting with /", async () => {
      const { uploadFile } = await import("@/lib/storage");
      await expect(
        uploadFile({
          buffer: Buffer.from("content"),
          fileName: "test.pdf",
          mimeType: "application/pdf",
          storageKey: "/absolute/path/file.pdf",
        })
      ).rejects.toThrow(/path traversal/);
    });

    test("rejects files exceeding max upload size", async () => {
      const { uploadFile } = await import("@/lib/storage");
      const oversizedBuffer = Buffer.alloc(26 * 1024 * 1024); // 26 MB
      await expect(
        uploadFile({
          buffer: oversizedBuffer,
          fileName: "large.pdf",
          mimeType: "application/pdf",
          storageKey: "tenant/session/large.pdf",
        })
      ).rejects.toThrow(/exceeds maximum size/);
    });

    test("sets x-upsert header to true", async () => {
      const { uploadFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValueOnce(""),
      } as unknown as Response);

      await uploadFile({
        buffer: Buffer.from("content"),
        fileName: "test.pdf",
        mimeType: "application/pdf",
        storageKey: "test/path",
      });

      const call = mockFetch.mock.calls[0];
      expect((call[1] as any).headers["x-upsert"]).toBe("true");
    });
  });

  // ─── Signed Download URL ──────────────────────────────────────────────────

  describe("signedDownloadUrl", () => {
    test("generates signed URL with correct endpoint", async () => {
      const { signedDownloadUrl } = await import("@/lib/storage");
      const signedURLPath = "/object/sign/session-files/tenant/file.pdf?token=abc123";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ signedURL: signedURLPath }),
      } as unknown as Response);

      const url = await signedDownloadUrl("tenant/file.pdf");

      expect(url).toBe(`https://example.supabase.co/storage/v1${signedURLPath}`);
    });

    test("sends POST with expiresIn: 3600", async () => {
      const { signedDownloadUrl } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValueOnce({ signedURL: "/signed" }),
      } as unknown as Response);

      await signedDownloadUrl("tenant/file.pdf");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.supabase.co/storage/v1/object/sign/session-files/tenant/file.pdf",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer test-service-key-123",
            apikey: "test-service-key-123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ expiresIn: 3600 }),
        }
      );
    });

    test("throws error when signing fails", async () => {
      const { signedDownloadUrl } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(signedDownloadUrl("nonexistent/file.pdf")).rejects.toThrow(
        "Failed to generate signed URL"
      );
    });
  });

  // ─── Delete File ──────────────────────────────────────────────────────────

  describe("deleteFile", () => {
    test("sends DELETE request to correct endpoint", async () => {
      const { deleteFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as unknown as Response);

      await deleteFile("tenant/session/file.pdf");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.supabase.co/storage/v1/object/session-files/tenant/session/file.pdf",
        {
          method: "DELETE",
          headers: {
            Authorization: "Bearer test-service-key-123",
            apikey: "test-service-key-123",
          },
        }
      );
    });

    test("succeeds silently when file not found (404)", async () => {
      const { deleteFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response);

      // Should not throw
      await deleteFile("nonexistent/file.pdf");
      expect(mockFetch).toHaveBeenCalled();
    });

    test("throws error on non-404 failures", async () => {
      const { deleteFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: vi.fn().mockResolvedValueOnce("Forbidden"),
      } as unknown as Response);

      await expect(deleteFile("tenant/file.pdf")).rejects.toThrow(
        "Storage delete failed"
      );
    });

    test("includes error details in exception", async () => {
      const { deleteFile } = await import("@/lib/storage");
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValueOnce("Server error details"),
      } as unknown as Response);

      await expect(deleteFile("tenant/file.pdf")).rejects.toThrow(
        /500.*Server error details/
      );
    });
  });

  // ─── isStorageConfigured ──────────────────────────────────────────────────

  describe("isStorageConfigured", () => {
    test("returns true when both env vars are set", async () => {
      // Module was imported with both env vars set
      // Need to re-import after resetModules from other tests
      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_KEY = "test-service-key-123";
      vi.resetModules();
      const { isStorageConfigured: check } = await import("@/lib/storage");
      expect(check()).toBe(true);
    });

    test("returns false when SUPABASE_URL is missing", async () => {
      delete process.env.SUPABASE_URL;
      process.env.SUPABASE_SERVICE_KEY = "test-key";

      vi.resetModules();
      const { isStorageConfigured: check } = await import("@/lib/storage");
      expect(check()).toBe(false);
    });

    test("returns false when SUPABASE_SERVICE_KEY is missing", async () => {
      process.env.SUPABASE_URL = "https://example.supabase.co";
      delete process.env.SUPABASE_SERVICE_KEY;

      vi.resetModules();
      const { isStorageConfigured: check } = await import("@/lib/storage");
      expect(check()).toBe(false);
    });

    test("returns false when both env vars are missing", async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;

      vi.resetModules();
      const { isStorageConfigured: check } = await import("@/lib/storage");
      expect(check()).toBe(false);
    });

    test("returns false when env vars are empty strings", async () => {
      process.env.SUPABASE_URL = "";
      process.env.SUPABASE_SERVICE_KEY = "";

      vi.resetModules();
      const { isStorageConfigured: check } = await import("@/lib/storage");
      expect(check()).toBe(false);
    });
  });

  // ─── Missing env vars (re-import needed) ──────────────────────────────────

  describe("missing env vars", () => {
    test("storageBase throws when env vars are empty", async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;

      vi.resetModules();
      global.fetch = vi.fn();
      const storage = await import("@/lib/storage");

      expect(
        storage.uploadFile({
          buffer: Buffer.from("x"),
          fileName: "x",
          mimeType: "text/plain",
          storageKey: "x",
        })
      ).rejects.toThrow("File storage not configured");
    });

    test("signedDownloadUrl throws when env vars are empty", async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;

      vi.resetModules();
      global.fetch = vi.fn();
      const storage = await import("@/lib/storage");

      expect(storage.signedDownloadUrl("test")).rejects.toThrow(
        "File storage not configured"
      );
    });

    test("deleteFile throws when env vars are empty", async () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;

      vi.resetModules();
      global.fetch = vi.fn();
      const storage = await import("@/lib/storage");

      expect(storage.deleteFile("test")).rejects.toThrow(
        "File storage not configured"
      );
    });
  });

  // ─── Edge cases ────────────────────────────────────────────────────────────

  describe("Edge cases", () => {
    beforeEach(async () => {
      // Restore env and re-assign fetch mock (may have been replaced by resetModules tests)
      process.env.SUPABASE_URL = "https://example.supabase.co";
      process.env.SUPABASE_SERVICE_KEY = "test-service-key-123";
      vi.resetModules();
      global.fetch = vi.fn();
    });

    test("handles special characters in storage key", async () => {
      const mf = global.fetch as jest.MockedFunction<typeof fetch>;
      mf.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: vi.fn().mockResolvedValueOnce(""),
      } as unknown as Response);

      // Re-import with proper env
      vi.resetModules();
      global.fetch = vi.fn();
      const mf2 = global.fetch as jest.MockedFunction<typeof fetch>;
      mf2.mockResolvedValueOnce({
        ok: true, status: 200, text: vi.fn().mockResolvedValueOnce(""),
      } as unknown as Response);

      const storage = await import("@/lib/storage");
      const specialKey = "tenant/session/my file (1).pdf";
      await storage.uploadFile({
        buffer: Buffer.from("content"),
        fileName: "my file (1).pdf",
        mimeType: "application/pdf",
        storageKey: specialKey,
      });

      expect(mf2).toHaveBeenCalledWith(
        expect.stringContaining(specialKey),
        expect.anything()
      );
    });

    test("handles large file buffers", async () => {
      vi.resetModules();
      global.fetch = vi.fn();
      const mf2 = global.fetch as jest.MockedFunction<typeof fetch>;
      mf2.mockResolvedValueOnce({
        ok: true, status: 200, text: vi.fn().mockResolvedValueOnce(""),
      } as unknown as Response);

      const storage = await import("@/lib/storage");
      const largeBuffer = Buffer.alloc(5 * 1024 * 1024); // 5MB
      await storage.uploadFile({
        buffer: largeBuffer,
        fileName: "large.bin",
        mimeType: "application/octet-stream",
        storageKey: "tenant/large.bin",
      });

      expect(mf2).toHaveBeenCalled();
    });
  });
});
