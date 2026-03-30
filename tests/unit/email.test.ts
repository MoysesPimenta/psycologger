/**
 * Unit tests — Email service (src/lib/email.ts)
 * Tests: sendMagicLink, sendInviteEmail, sendAppointmentConfirmation, sendAppointmentReminder
 */

// Shared mock send function — must be declared before jest.mock
const mockSend = jest.fn();

jest.mock("resend", () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

import {
  sendMagicLink,
  sendInviteEmail,
  sendAppointmentConfirmation,
  sendAppointmentReminder,
} from "@/lib/email";

const originalConsoleLog = console.log;
const originalConsoleError = console.error;

describe("Email service", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({ data: { id: "msg-123" }, error: null });
    console.log = jest.fn();
    console.error = jest.fn();
    process.env.RESEND_API_KEY = "test-api-key";
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  // ─── Magic Link ───────────────────────────────────────────────────────────

  describe("sendMagicLink", () => {
    test("generates HTML with correct structure", async () => {
      await sendMagicLink({
        to: "user@example.com",
        url: "https://app.example.com/magic/abc123",
        name: "João",
      });

      expect(mockSend).toHaveBeenCalled();
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe("user@example.com");
      expect(call.subject).toContain("link de acesso");
      expect(call.html).toContain("João");
      expect(call.html).toContain("Entrar na minha conta");
    });

    test("escapes user-supplied name to prevent XSS", async () => {
      await sendMagicLink({
        to: "user@example.com",
        url: "https://app.example.com/magic/abc123",
        name: "<script>alert('xss')</script>",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("&lt;script&gt;");
      expect(call.html).not.toContain("<script>");
    });

    test("escapes URL to prevent XSS", async () => {
      await sendMagicLink({
        to: "user@example.com",
        url: 'https://app.example.com/magic/abc"onload=alert(1)',
        name: "Test",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("&quot;");
    });

    test("works without optional name", async () => {
      await sendMagicLink({
        to: "user@example.com",
        url: "https://app.example.com/magic/abc123",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("Olá!");
      expect(call.html).not.toContain("undefined");
    });
  });

  // ─── Invite Email ─────────────────────────────────────────────────────────

  describe("sendInviteEmail", () => {
    test("generates HTML with tenant and role info", async () => {
      await sendInviteEmail({
        to: "newuser@example.com",
        inviteUrl: "https://app.example.com/invite/xyz789",
        tenantName: "Clínica Saúde",
        role: "PSYCHOLOGIST",
        inviterName: "Dr. Silva",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe("newuser@example.com");
      expect(call.html).toContain("Dr. Silva");
      expect(call.html).toContain("Psicólogo(a)");
      expect(call.html).toContain("Aceitar convite");
    });

    test("escapes tenant name to prevent XSS", async () => {
      await sendInviteEmail({
        to: "newuser@example.com",
        inviteUrl: "https://app.example.com/invite/xyz789",
        tenantName: '<img src=x onerror="alert(1)">',
        role: "PSYCHOLOGIST",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("&lt;img");
      expect(call.html).not.toContain("<img src=x");
    });

    test("translates role codes to Portuguese labels", async () => {
      const roles = {
        TENANT_ADMIN: "Administrador",
        PSYCHOLOGIST: "Psicólogo(a)",
        ASSISTANT: "Assistente/Faturamento",
        READONLY: "Leitor",
      };

      for (const [role, label] of Object.entries(roles)) {
        mockSend.mockReset();
        mockSend.mockResolvedValue({ data: { id: "msg-456" }, error: null });

        await sendInviteEmail({
          to: "test@example.com",
          inviteUrl: "https://app.example.com/invite/xyz789",
          tenantName: "Test",
          role,
        });

        const call = mockSend.mock.calls[0][0];
        expect(call.html).toContain(label);
      }
    });

    test("works without optional inviterName", async () => {
      await sendInviteEmail({
        to: "newuser@example.com",
        inviteUrl: "https://app.example.com/invite/xyz789",
        tenantName: "Clinic",
        role: "PSYCHOLOGIST",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("Você foi convidado");
      expect(call.html).not.toContain("undefined");
    });
  });

  // ─── Appointment Confirmation ──────────────────────────────────────────────

  describe("sendAppointmentConfirmation", () => {
    test("generates HTML with appointment details", async () => {
      await sendAppointmentConfirmation({
        to: "patient@example.com",
        patientName: "Maria Silva",
        appointmentDate: "15 de março de 2026",
        appointmentTime: "14:30",
        clinicName: "Clínica Serena",
        location: "Sala 301, Av. Paulista 1000",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe("patient@example.com");
      expect(call.html).toContain("Maria Silva");
      expect(call.html).toContain("15 de março de 2026");
      expect(call.html).toContain("14:30");
      expect(call.html).toContain("Sala 301");
    });

    test("includes video link when provided", async () => {
      await sendAppointmentConfirmation({
        to: "patient@example.com",
        patientName: "João",
        appointmentDate: "15 de março",
        appointmentTime: "14:30",
        clinicName: "Clinic",
        videoLink: "https://meet.example.com/room123",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("https://meet.example.com/room123");
      expect(call.html).toContain("Link para consulta online");
    });

    test("prefers video link over location when both provided", async () => {
      await sendAppointmentConfirmation({
        to: "patient@example.com",
        patientName: "João",
        appointmentDate: "15 de março",
        appointmentTime: "14:30",
        clinicName: "Clinic",
        location: "Sala 301",
        videoLink: "https://meet.example.com/room123",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("https://meet.example.com/room123");
      // videoLink takes precedence — location not shown
      expect(call.html).not.toContain("Sala 301");
    });

    test("escapes all user inputs to prevent XSS", async () => {
      await sendAppointmentConfirmation({
        to: "patient@example.com",
        patientName: "<img src=x>",
        appointmentDate: '">script<',
        appointmentTime: "14:30",
        clinicName: "<b>Hack</b>",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("&lt;img");
      expect(call.html).toContain("&lt;b&gt;");
      expect(call.html).not.toContain("<img src=x>");
      expect(call.html).not.toContain("<b>Hack</b>");
    });
  });

  // ─── Appointment Reminder ──────────────────────────────────────────────────

  describe("sendAppointmentReminder", () => {
    test("generates HTML with reminder details", async () => {
      await sendAppointmentReminder({
        to: "patient@example.com",
        patientName: "Ana Costa",
        appointmentDate: "16 de março de 2026",
        appointmentTime: "10:00",
        clinicName: "Centro de Saúde",
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe("patient@example.com");
      expect(call.subject).toContain("Lembrete");
      expect(call.html).toContain("Ana Costa");
      expect(call.html).toContain("16 de março de 2026");
      expect(call.html).toContain("10:00");
      expect(call.html).toContain("amanhã");
    });

    test("escapes clinic name and patient name", async () => {
      await sendAppointmentReminder({
        to: "patient@example.com",
        patientName: "<script>alert(1)</script>",
        appointmentDate: "16 de março",
        appointmentTime: "10:00",
        clinicName: '<img src=x onerror="alert(1)">',
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain("&lt;script&gt;");
      expect(call.html).toContain("&lt;img");
      expect(call.html).not.toContain("<script>");
      // HTML special chars are escaped — raw tags can't execute
      expect(call.html).not.toContain("<img src=x");
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe("Error handling", () => {
    test("throws when Resend returns error object", async () => {
      mockSend.mockResolvedValueOnce({ error: { message: "Invalid API key" }, data: null });

      await expect(
        sendMagicLink({
          to: "user@example.com",
          url: "https://example.com/magic/test",
        })
      ).rejects.toThrow("Email send failed");
    });

    test("logs error to console.error before throwing", async () => {
      mockSend.mockResolvedValueOnce({ error: { message: "Network timeout" }, data: null });

      try {
        await sendMagicLink({
          to: "user@example.com",
          url: "https://example.com/magic/test",
        });
      } catch {
        // Expected to throw
      }

      expect(console.error).toHaveBeenCalledWith(
        "[email] Resend error:",
        expect.objectContaining({ message: "Network timeout" })
      );
    });

    test("handles when send throws an exception", async () => {
      mockSend.mockRejectedValueOnce(new Error("Network error"));

      await expect(
        sendMagicLink({
          to: "user@example.com",
          url: "https://example.com/magic/test",
        })
      ).rejects.toThrow("Network error");
    });
  });
});
