import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPatientContext } from "@/lib/patient-auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED = new Set(["light", "dark", "system"]);
export const THEME_COOKIE_NAME = "psy-theme";
const ONE_YEAR_S = 60 * 60 * 24 * 365;

function setCookie(res: NextResponse, theme: string) {
  res.cookies.set(THEME_COOKIE_NAME, theme, {
    httpOnly: false, // client toggle reads it for instant feedback
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_S,
  });
}

export async function POST(req: NextRequest) {
  let body: { theme?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }
  const theme = typeof body.theme === "string" ? body.theme : "";
  if (!ALLOWED.has(theme)) {
    return NextResponse.json({ error: "INVALID_THEME" }, { status: 400 });
  }

  // Try staff session first
  const staff = await getServerSession(authOptions);
  if (staff?.user?.id) {
    await db.user.update({
      where: { id: staff.user.id },
      data: { themePreference: theme },
    });
    const res = NextResponse.json({ ok: true, theme });
    setCookie(res, theme);
    return res;
  }

  // Then patient portal session
  try {
    const ctx = await getPatientContext(req);
    if (ctx?.patientId) {
      await db.patient.update({
        where: { id: ctx.patientId },
        data: { themePreference: theme },
      });
      const res = NextResponse.json({ ok: true, theme });
      setCookie(res, theme);
      return res;
    }
  } catch {
    // fall through — anonymous toggle still allowed via cookie only
  }

  // Anonymous (e.g. marketing pages): cookie-only persistence
  const res = NextResponse.json({ ok: true, theme, anonymous: true });
  setCookie(res, theme);
  return res;
}
