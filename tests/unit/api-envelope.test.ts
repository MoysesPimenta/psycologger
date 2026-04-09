import { describe, it, expect } from "vitest";
import { ZodError, z } from "zod";
import {
  ok,
  apiError,
  handleApiError,
  NotFoundError,
  ConflictError,
  BadRequestError,
} from "@/lib/api";

describe("API envelope utilities", () => {
  describe("ok()", () => {
    it("should return 200 with data", async () => {
      const response = ok({ id: "123", name: "Test" });
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toEqual({ id: "123", name: "Test" });
    });

    it("should include meta when provided", async () => {
      const response = ok(
        { id: "123" },
        { page: 1, pageSize: 20, total: 100, hasMore: true }
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.meta).toEqual({
        page: 1,
        pageSize: 20,
        total: 100,
        hasMore: true,
      });
    });
  });

  describe("apiError()", () => {
    it("should return error with specified status code", async () => {
      const response = apiError("NOT_FOUND", "Resource not found", 404);
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("Resource not found");
    });

    it("should include details when provided", async () => {
      const details = { field: "email", issue: "invalid format" };
      const response = apiError(
        "VALIDATION_ERROR",
        "Validation failed",
        400,
        details
      );
      const body = await response.json();
      expect(body.error.details).toEqual(details);
    });

    it("should include custom headers when provided", async () => {
      const response = apiError(
        "TOO_MANY_REQUESTS",
        "Rate limited",
        429,
        undefined,
        { "Retry-After": "60" }
      );
      expect(response.headers.get("Retry-After")).toBe("60");
    });
  });

  describe("handleApiError()", () => {
    it("should handle NotFoundError", async () => {
      const error = new NotFoundError("User");
      const response = handleApiError(error);
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe("NOT_FOUND");
      expect(body.error.message).toBe("User não encontrado");
    });

    it("should handle ConflictError", async () => {
      const error = new ConflictError("User already exists");
      const response = handleApiError(error);
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toBe("User already exists");
    });

    it("should handle BadRequestError", async () => {
      const error = new BadRequestError("Invalid input");
      const response = handleApiError(error);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("BAD_REQUEST");
      expect(body.error.message).toBe("Invalid input");
    });

    it("should handle ZodError", async () => {
      const schema = z.object({ email: z.string().email() });
      let zodError: ZodError | null = null;
      try {
        schema.parse({ email: "invalid" });
      } catch (e) {
        zodError = e as ZodError;
      }

      expect(zodError).not.toBeNull();
      const response = handleApiError(zodError);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toBe("Entrada inválida");
      expect(body.error.details).toBeDefined();
    });

    it("should handle generic errors with 500", async () => {
      const error = new Error("Something went wrong");
      const response = handleApiError(error);
      expect(response.status).toBe(500);
      const body = await response.json();
      expect(body.error.code).toBe("INTERNAL_ERROR");
      expect(body.error.message).toBe("Um erro inesperado ocorreu");
    });
  });
});
