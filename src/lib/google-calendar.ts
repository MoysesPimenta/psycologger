/**
 * Google Calendar OAuth2 & API integration — Psycologger
 * Handles authentication, token exchange, and calendar event operations.
 */

import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import type { calendar_v3 } from "googleapis";

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  token_type: string;
  scope: string;
}

type GoogleCalendarEvent = calendar_v3.Schema$Event;

function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_CALENDAR_REDIRECT_URI ||
    `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/v1/calendar/callback`;

  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set");
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate OAuth2 authorization URL for the user to visit.
 * The user grants Psycologger access to their Google Calendar.
 */
export function generateAuthUrl(): string {
  const oauth2 = getOAuth2Client();
  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ];

  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: scopes,
    prompt: "consent", // Always ask user to grant access (for re-auth flow)
  });

  return url;
}

/**
 * Exchange OAuth2 authorization code for tokens.
 * Called from the callback route after the user grants access.
 */
export async function exchangeCode(code: string): Promise<GoogleTokenResponse> {
  const oauth2 = getOAuth2Client();
  const { tokens } = await oauth2.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Failed to obtain access token from Google");
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? null,
    expires_in: tokens.expiry_date
      ? Math.floor((tokens.expiry_date - Date.now()) / 1000)
      : 3600,
    token_type: tokens.token_type || "Bearer",
    scope: tokens.scope || "",
  };
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshTokens(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ refresh_token: refreshToken });

  const { credentials } = await oauth2.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error("Failed to refresh access token");
  }

  return {
    access_token: credentials.access_token,
    expires_in: credentials.expiry_date
      ? Math.floor((credentials.expiry_date - Date.now()) / 1000)
      : 3600,
  };
}

/**
 * Create a calendar event on the user's selected calendar.
 * Returns the event ID from Google Calendar.
 */
export async function createCalendarEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleCalendarEvent
): Promise<string> {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    const response = await calendar.events.insert({
      calendarId,
      requestBody: event as calendar_v3.Schema$Event,
      conferenceDataVersion: event.conferenceData ? 1 : 0,
    } as any);

    if (!response.data?.id) {
      throw new Error("Google Calendar API did not return an event ID");
    }

    return response.data.id;
  } catch (err) {
    // Log but don't expose sensitive details
    console.error("[google-calendar] Failed to create event:", {
      calendarId,
      eventSummary: event.summary,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("Failed to create calendar event");
  }
}

/**
 * Update an existing calendar event.
 */
export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: Partial<GoogleCalendarEvent>
): Promise<void> {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    await calendar.events.update({
      calendarId,
      eventId,
      requestBody: event as calendar_v3.Schema$Event,
      conferenceDataVersion: event.conferenceData ? 1 : 0,
    } as any);
  } catch (err) {
    console.error("[google-calendar] Failed to update event:", {
      calendarId,
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("Failed to update calendar event");
  }
}

/**
 * Delete a calendar event.
 */
export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    await calendar.events.delete({
      calendarId,
      eventId,
    });
  } catch (err) {
    console.error("[google-calendar] Failed to delete event:", {
      calendarId,
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new Error("Failed to delete calendar event");
  }
}

/**
 * List calendars accessible to the user.
 */
export async function listCalendars(
  accessToken: string
): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    const response = await calendar.calendarList.list({
      maxResults: 50,
    });

    return (response.data.items ?? []).map((cal) => ({
      id: cal.id || "",
      summary: cal.summary || "Unnamed Calendar",
      primary: cal.primary ?? undefined,
    }));
  } catch (err) {
    console.error("[google-calendar] Failed to list calendars:", err);
    throw new Error("Failed to list calendars");
  }
}

/**
 * Get a specific calendar's metadata (e.g., to check timezone).
 */
export async function getCalendar(
  accessToken: string,
  calendarId: string
): Promise<{ id: string; summary: string; timeZone?: string }> {
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials({ access_token: accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  try {
    const response = await calendar.calendars.get({
      calendarId,
    });

    return {
      id: response.data.id ?? "",
      summary: response.data.summary ?? "",
      timeZone: response.data.timeZone ?? undefined,
    };
  } catch (err) {
    console.error("[google-calendar] Failed to get calendar:", err);
    throw new Error("Failed to get calendar details");
  }
}
