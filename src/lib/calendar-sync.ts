/**
 * High-level appointment ↔ Google Calendar sync — Psycologger
 * Handles bidirectional sync of appointments to the provider's Google Calendar.
 */

import { db } from "./db";
import { decryptJson, encryptJson } from "./crypto";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  refreshTokens,
} from "./google-calendar";

interface GoogleTokenData {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
  expires_at?: number; // Unix timestamp
}

/**
 * Sync an appointment to Google Calendar.
 * - Fetches the provider's GoogleCalendarToken and verifies sync is enabled.
 * - Refreshes the token if expired.
 * - Creates or updates the event on Google Calendar.
 * - Stores the googleCalendarEventId and marks googleCalendarSynced = true.
 * Errors are logged but not thrown — sync failures are non-critical.
 */
export async function syncAppointmentToCalendar(appointmentId: string): Promise<void> {
  try {
    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        provider: { select: { id: true, name: true } },
        patient: { select: { id: true, fullName: true } },
        appointmentType: { select: { id: true, name: true } },
      },
    });

    if (!appointment) {
      console.warn("[calendar-sync] Appointment not found:", appointmentId);
      return;
    }

    // Fetch provider's Google Calendar token
    const gcalToken = await db.googleCalendarToken.findUnique({
      where: { userId: appointment.providerUserId },
    });

    if (!gcalToken || !gcalToken.syncEnabled || !gcalToken.calendarId) {
      console.debug("[calendar-sync] Google Calendar sync not enabled for provider:", {
        appointmentId,
        providerId: appointment.providerUserId,
      });
      return;
    }

    // Decrypt the OAuth tokens
    let tokenData = await decryptJson<GoogleTokenData>(gcalToken.encryptedTokenJson);

    // Check if token is expired and refresh if needed
    const now = Math.floor(Date.now() / 1000);
    if (tokenData.expires_at && tokenData.expires_at < now + 300) {
      // Refresh if expires within 5 minutes
      if (!tokenData.refresh_token) {
        console.warn("[calendar-sync] Token expired and no refresh token available");
        return;
      }

      try {
        const refreshed = await refreshTokens(tokenData.refresh_token);
        tokenData.access_token = refreshed.access_token;
        tokenData.expires_at = now + refreshed.expires_in;

        // Update the stored token
        const reencrypted = await encryptJson(tokenData);
        await db.googleCalendarToken.update({
          where: { id: gcalToken.id },
          data: { encryptedTokenJson: reencrypted },
        });
      } catch (err) {
        console.error("[calendar-sync] Failed to refresh token:", err);
        return;
      }
    }

    // Build the event object
    const eventSummary = `${appointment.appointmentType.name}`;
    const eventDescription = `Patient: ${appointment.patient.fullName}\nType: ${appointment.appointmentType.name}`;

    const calendarEvent = {
      summary: eventSummary,
      description: eventDescription,
      start: {
        dateTime: appointment.startsAt.toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: appointment.endsAt.toISOString(),
        timeZone: "UTC",
      },
      location: appointment.location || undefined,
    };

    let eventId = appointment.googleCalendarEventId;

    try {
      if (eventId) {
        // Update existing event
        await updateCalendarEvent(
          tokenData.access_token,
          gcalToken.calendarId,
          eventId,
          calendarEvent
        );
      } else {
        // Create new event
        eventId = await createCalendarEvent(
          tokenData.access_token,
          gcalToken.calendarId,
          calendarEvent
        );
      }

      // Mark as synced
      await db.appointment.update({
        where: { id: appointmentId },
        data: {
          googleCalendarEventId: eventId,
          googleCalendarSynced: true,
        },
      });
    } catch (err) {
      console.error("[calendar-sync] Failed to sync appointment to calendar:", {
        appointmentId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Don't throw — mark as failed but don't prevent other operations
    }
  } catch (err) {
    console.error("[calendar-sync] Unexpected error in syncAppointmentToCalendar:", err);
  }
}

/**
 * Remove an appointment from Google Calendar.
 * - Fetches the provider's GoogleCalendarToken.
 * - Deletes the event from Google Calendar if googleCalendarEventId is set.
 * - Clears googleCalendarEventId and googleCalendarSynced.
 * Errors are logged but not thrown.
 */
export async function removeAppointmentFromCalendar(appointmentId: string): Promise<void> {
  try {
    const appointment = await db.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) {
      console.warn("[calendar-sync] Appointment not found:", appointmentId);
      return;
    }

    if (!appointment.googleCalendarEventId) {
      // Nothing to remove
      return;
    }

    // Fetch provider's Google Calendar token
    const gcalToken = await db.googleCalendarToken.findUnique({
      where: { userId: appointment.providerUserId },
    });

    if (!gcalToken || !gcalToken.calendarId) {
      console.debug("[calendar-sync] Google Calendar token not available for provider:", {
        appointmentId,
        providerId: appointment.providerUserId,
      });
      // Clear the appointment fields anyway
      await db.appointment.update({
        where: { id: appointmentId },
        data: {
          googleCalendarEventId: null,
          googleCalendarSynced: false,
        },
      });
      return;
    }

    // Decrypt the OAuth tokens
    let tokenData = await decryptJson<GoogleTokenData>(gcalToken.encryptedTokenJson);

    // Refresh token if expired
    const now = Math.floor(Date.now() / 1000);
    if (tokenData.expires_at && tokenData.expires_at < now + 300) {
      if (tokenData.refresh_token) {
        try {
          const refreshed = await refreshTokens(tokenData.refresh_token);
          tokenData.access_token = refreshed.access_token;
          tokenData.expires_at = now + refreshed.expires_in;

          const reencrypted = await encryptJson(tokenData);
          await db.googleCalendarToken.update({
            where: { id: gcalToken.id },
            data: { encryptedTokenJson: reencrypted },
          });
        } catch (err) {
          console.error("[calendar-sync] Failed to refresh token for deletion:", err);
        }
      }
    }

    try {
      await deleteCalendarEvent(
        tokenData.access_token,
        gcalToken.calendarId,
        appointment.googleCalendarEventId
      );
    } catch (err) {
      console.error("[calendar-sync] Failed to delete calendar event:", {
        appointmentId,
        error: err instanceof Error ? err.message : String(err),
      });
      // Continue to clear local fields anyway
    }

    // Clear the appointment fields
    await db.appointment.update({
      where: { id: appointmentId },
      data: {
        googleCalendarEventId: null,
        googleCalendarSynced: false,
      },
    });
  } catch (err) {
    console.error("[calendar-sync] Unexpected error in removeAppointmentFromCalendar:", err);
  }
}
