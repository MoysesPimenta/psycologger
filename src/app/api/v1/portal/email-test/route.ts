/**
 * POST /api/v1/portal/email-test — Diagnose Resend email delivery
 *
 * TEMPORARY diagnostic endpoint. Remove before going to production.
 * Requires NEXTAUTH_SECRET as bearer token for auth.
 *
 * Usage:
 *   curl -X POST https://your-app.vercel.app/api/v1/portal/email-test \
 *     -H "Authorization: Bearer YOUR_NEXTAUTH_SECRET" \
 *     -H "Content-Type: application/json" \
 *     -d '{ "to": "test@example.com" }'
 */

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Only allow with the NEXTAUTH_SECRET as bearer token
  const auth = req.headers.get("authorization");
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const to = body.to as string;
  if (!to || !to.includes("@")) {
    return NextResponse.json(
      { error: 'Provide { "to": "email@example.com" }' },
      { status: 400 },
    );
  }

  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    NODE_ENV: process.env.NODE_ENV,
    RESEND_API_KEY_set: !!process.env.RESEND_API_KEY,
    RESEND_API_KEY_prefix: process.env.RESEND_API_KEY?.substring(0, 8) ?? "NOT SET",
    RESEND_API_KEY_is_test: process.env.RESEND_API_KEY?.startsWith("re_test_") ?? false,
    EMAIL_FROM: process.env.EMAIL_FROM ?? "(default: Psycologger <noreply@psycologger.com>)",
    NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? "(not set)",
    to,
  };

  // Extract domain from EMAIL_FROM
  const fromEmail = process.env.EMAIL_FROM ?? "Psycologger <noreply@psycologger.com>";
  const domainMatch = fromEmail.match(/@([^>]+)/);
  diagnostics.from_domain = domainMatch?.[1]?.trim() ?? "COULD NOT PARSE";

  // Try to send
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    console.log("[email-test] Attempting to send test email:", JSON.stringify(diagnostics));

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [to],
      subject: "Psycologger — Teste de email",
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto;">
          <h2 style="color:#1e3a8a;">Teste de Email</h2>
          <p>Se você está lendo isso, o envio de email está funcionando!</p>
          <p style="color:#6b7280; font-size:13px;">
            From: ${fromEmail}<br/>
            To: ${to}<br/>
            Timestamp: ${new Date().toISOString()}<br/>
          </p>
        </div>
      `,
    });

    if (error) {
      const errObj = error as unknown as Record<string, unknown>;
      diagnostics.resend_error = {
        message: error.message,
        name: errObj.name,
        statusCode: errObj.statusCode,
        full: error,
      };

      if (errObj.statusCode === 403) {
        diagnostics.likely_cause =
          "Domain not verified or using test API key. " +
          `Check that domain "${diagnostics.from_domain}" is verified at https://resend.com/domains. ` +
          "If using re_test_* key, switch to a live key.";
      }

      console.error("[email-test] FAILED:", JSON.stringify(diagnostics));
      return NextResponse.json({ success: false, diagnostics }, { status: 200 });
    }

    diagnostics.resend_response = data;
    diagnostics.email_id = data?.id;
    console.log("[email-test] SUCCESS:", JSON.stringify(diagnostics));
    return NextResponse.json({ success: true, diagnostics }, { status: 200 });
  } catch (err) {
    diagnostics.exception = {
      message: (err as Error).message,
      stack: (err as Error).stack?.split("\n").slice(0, 3),
    };
    console.error("[email-test] EXCEPTION:", JSON.stringify(diagnostics));
    return NextResponse.json({ success: false, diagnostics }, { status: 200 });
  }
}
