/**
 * LGPD DSAR (Data Subject Access Request) — Patient-level data export and deletion
 *
 * Implements LGPD Article 18 (access) and Article 17 (deletion) workflows.
 * - exportPatientData: Collect all patient data into JSON for export
 * - deletePatientData: Hard-delete patient data respecting foreign key constraints
 * - anonymizePatientData: Replace PII with placeholder, set isActive=false
 */

import { db } from "./db";
import { decrypt } from "./crypto";

export interface PatientDataExport {
  patient: {
    id: string;
    tenantId: string;
    fullName: string;
    preferredName: string | null;
    email: string | null;
    phone: string | null;
    dob: string | null;
    cpf: string | null; // Decrypted
    notes: string | null; // Decrypted
    tags: string[];
    isActive: boolean;
    archivedAt: string | null;
    consentGiven: boolean;
    consentGivenAt: string | null;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  contacts: Array<{
    id: string;
    type: string;
    name: string;
    phone: string | null;
    email: string | null;
    createdAt: string;
  }>;
  appointments: Array<{
    id: string;
    startsAt: string;
    endsAt: string;
    status: string;
    location: string | null;
    videoLink: string | null;
    adminNotes: string | null;
    createdAt: string;
  }>;
  clinicalSessions: Array<{
    id: string;
    templateKey: string;
    noteText: string; // Decrypted
    tags: string[];
    sessionDate: string;
    createdAt: string;
  }>;
  charges: Array<{
    id: string;
    amountCents: number;
    discountCents: number;
    currency: string;
    dueDate: string;
    status: string;
    description: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  payments: Array<{
    id: string;
    chargeId: string;
    amountCents: number;
    method: string;
    paidAt: string;
    reference: string | null;
    notes: string | null;
    createdAt: string;
  }>;
  journalEntries: Array<{
    id: string;
    entryType: string;
    visibility: string;
    moodScore: number | null;
    anxietyScore: number | null;
    energyScore: number | null;
    sleepScore: number | null;
    emotionTags: string[];
    noteText: string | null; // Decrypted
    discussNextSession: boolean;
    flaggedForSupport: boolean;
    createdAt: string;
  }>;
  consentRecords: Array<{
    id: string;
    consentType: string;
    version: string;
    acceptedAt: string;
    revokedAt: string | null;
  }>;
  notificationPreferences: {
    id: string;
    notifySessionReminder: boolean;
    notifyPaymentReminder: boolean;
    notifyPreSessionPrompt: boolean;
    reminderHoursBefore: number;
    timezone: string;
  } | null;
  fileMetadata: Array<{
    id: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    isClinical: boolean;
    createdAt: string;
  }>;
  exportedAt: string;
}

/**
 * Export all patient data into a single JSON structure.
 * Decrypts sensitive fields (CPF, clinical notes, journal content).
 * Does NOT include file contents, only metadata.
 */
export async function exportPatientData(
  tenantId: string,
  patientId: string
): Promise<PatientDataExport> {
  // Fetch patient with all relations
  const patient = await db.patient.findFirst({
    where: { id: patientId, tenantId },
    include: {
      contacts: true,
      appointments: true,
      clinicalSessions: true,
      charges: { include: { payments: true } },
      journalEntries: true,
      consentRecords: true,
      preference: true,
      files: {
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          sizeBytes: true,
          isClinical: true,
          createdAt: true,
        },
      },
    },
  });

  if (!patient) {
    throw new Error(`Patient ${patientId} not found in tenant ${tenantId}`);
  }

  // Decrypt sensitive fields
  let decryptedCpf: string | null = null;
  let decryptedNotes: string | null = null;

  if (patient.cpf) {
    try {
      decryptedCpf = await decrypt(patient.cpf);
    } catch (err) {
      console.error(`[DSAR] Failed to decrypt CPF for patient ${patientId}:`, err);
      decryptedCpf = null;
    }
  }

  if (patient.notes) {
    try {
      decryptedNotes = await decrypt(patient.notes);
    } catch (err) {
      console.error(`[DSAR] Failed to decrypt notes for patient ${patientId}:`, err);
      decryptedNotes = null;
    }
  }

  // Decrypt clinical session notes
  const decryptedSessions = await Promise.all(
    patient.clinicalSessions.map(async (session) => {
      let decrypted = session.noteText;
      try {
        decrypted = await decrypt(session.noteText);
      } catch (err) {
        console.error(`[DSAR] Failed to decrypt session ${session.id}:`, err);
      }
      return {
        ...session,
        noteText: decrypted,
      };
    })
  );

  // Decrypt journal entries
  const decryptedJournals = await Promise.all(
    patient.journalEntries.map(async (entry) => {
      let noteText = entry.noteText;
      if (entry.noteText) {
        try {
          noteText = await decrypt(entry.noteText);
        } catch (err) {
          console.error(`[DSAR] Failed to decrypt journal entry ${entry.id}:`, err);
        }
      }
      return {
        ...entry,
        noteText,
      };
    })
  );

  // Flatten charges and payments
  const allPayments = patient.charges.flatMap((charge) =>
    charge.payments.map((payment) => ({
      ...payment,
      chargeId: charge.id,
    }))
  );

  const charges = patient.charges.map(({ payments, ...charge }) => charge);

  return {
    patient: {
      ...patient,
      cpf: decryptedCpf,
      notes: decryptedNotes,
      dob: patient.dob ? patient.dob.toISOString().split("T")[0] : null,
      archivedAt: patient.archivedAt?.toISOString() ?? null,
      consentGivenAt: patient.consentGivenAt?.toISOString() ?? null,
      lastLoginAt: patient.lastLoginAt?.toISOString() ?? null,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    },
    contacts: patient.contacts.map((c) => ({
      ...c,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    appointments: patient.appointments.map((a) => ({
      ...a,
      startsAt: a.startsAt.toISOString(),
      endsAt: a.endsAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
    clinicalSessions: decryptedSessions.map((s) => ({
      ...s,
      sessionDate: s.sessionDate.toISOString(),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    charges: charges.map((c) => ({
      ...c,
      dueDate: c.dueDate.toISOString().split("T")[0],
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    })),
    payments: allPayments.map((p) => ({
      ...p,
      paidAt: p.paidAt.toISOString(),
      createdAt: p.createdAt.toISOString(),
    })),
    journalEntries: decryptedJournals.map((j) => ({
      ...j,
      createdAt: j.createdAt.toISOString(),
      updatedAt: j.updatedAt.toISOString(),
    })),
    consentRecords: patient.consentRecords.map((c) => ({
      ...c,
      acceptedAt: c.acceptedAt.toISOString(),
      revokedAt: c.revokedAt?.toISOString() ?? null,
    })),
    notificationPreferences: patient.preference
      ? {
          id: patient.preference.id,
          notifySessionReminder: patient.preference.notifySessionReminder,
          notifyPaymentReminder: patient.preference.notifyPaymentReminder,
          notifyPreSessionPrompt: patient.preference.notifyPreSessionPrompt,
          reminderHoursBefore: patient.preference.reminderHoursBefore,
          timezone: patient.preference.timezone,
        }
      : null,
    fileMetadata: patient.files.map((f) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
    })),
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Hard-delete all patient data in a transaction.
 * Respects foreign key constraints by deleting in the correct order:
 * 1. Child records (payments, journal notes, sessions, appointments, charges, etc.)
 * 2. Parent records (patient, contacts)
 */
export async function deletePatientData(
  tenantId: string,
  patientId: string
): Promise<void> {
  await db.$transaction(async (tx) => {
    // Verify patient exists and belongs to tenant
    const patient = await tx.patient.findFirst({
      where: { id: patientId, tenantId },
      select: { id: true },
    });
    if (!patient) {
      throw new Error(`Patient ${patientId} not found in tenant ${tenantId}`);
    }

    // Delete in FK dependency order (child → parent)

    // 1. Payments (child of Charge)
    await tx.payment.deleteMany({
      where: {
        charge: { patientId },
      },
    });

    // 2. Payment reminder logs
    await tx.paymentReminderLog.deleteMany({
      where: {
        charge: { patientId },
      },
    });

    // 3. NFSE invoices
    await tx.nfseInvoice.deleteMany({
      where: {
        charge: { patientId },
      },
    });

    // 4. Charges
    await tx.charge.deleteMany({
      where: { patientId },
    });

    // 5. Journal notes
    await tx.journalNote.deleteMany({
      where: {
        journalEntry: { patientId },
      },
    });

    // 6. Journal entries
    await tx.journalEntry.deleteMany({
      where: { patientId },
    });

    // 7. Session revisions
    await tx.sessionRevision.deleteMany({
      where: {
        session: { patientId },
      },
    });

    // 8. Clinical sessions
    await tx.clinicalSession.deleteMany({
      where: { patientId },
    });

    // 9. Reminder logs
    await tx.reminderLog.deleteMany({
      where: {
        appointment: { patientId },
      },
    });

    // 10. Appointments
    await tx.appointment.deleteMany({
      where: { patientId },
    });

    // 11. Patient notifications
    await tx.patientNotification.deleteMany({
      where: { patientId },
    });

    // 12. Patient preferences
    await tx.patientPreference.deleteMany({
      where: { patientId },
    });

    // 13. Consent records
    await tx.consentRecord.deleteMany({
      where: { patientId },
    });

    // 14. Patient auth
    await tx.patientAuth.deleteMany({
      where: { patientId },
    });

    // 15. Patient portal sessions
    await tx.patientPortalSession.deleteMany({
      where: {
        patientAuth: { patientId },
      },
    });

    // 16. Patient contacts
    await tx.patientContact.deleteMany({
      where: { patientId },
    });

    // 17. Device tokens
    await tx.deviceToken.deleteMany({
      where: { patientId },
    });

    // 18. Files
    await tx.fileObject.deleteMany({
      where: { patientId },
    });

    // 19. Finally, the patient record
    await tx.patient.delete({
      where: { id: patientId },
    });
  });
}

/**
 * Anonymize patient data by:
 * - Replacing PII with "Paciente Removido"
 * - Clearing sensitive fields (cpf, phone, email, medical history)
 * - Setting isActive = false
 * - Clearing clinical notes and journal entries
 */
export async function anonymizePatientData(
  tenantId: string,
  patientId: string
): Promise<void> {
  await db.$transaction(async (tx) => {
    // Verify patient exists and belongs to tenant
    const patient = await tx.patient.findFirst({
      where: { id: patientId, tenantId },
      select: { id: true },
    });
    if (!patient) {
      throw new Error(`Patient ${patientId} not found in tenant ${tenantId}`);
    }

    // Update patient: clear PII, set inactive
    await tx.patient.update({
      where: { id: patientId },
      data: {
        fullName: "Paciente Removido",
        preferredName: null,
        email: null,
        phone: null,
        cpf: null,
        cpfBlindIndex: null,
        notes: null,
        isActive: false,
        lastLoginIp: null,
      },
    });

    // Clear clinical session notes
    await tx.clinicalSession.updateMany({
      where: { patientId },
      data: {
        noteText: "[Conteúdo removido por solicitação LGPD]",
      },
    });

    // Clear journal entries
    await tx.journalEntry.updateMany({
      where: { patientId },
      data: {
        noteText: "[Conteúdo removido por solicitação LGPD]",
        moodScore: null,
        anxietyScore: null,
        energyScore: null,
        sleepScore: null,
        emotionTags: [],
      },
    });

    // Clear journal notes (therapist annotations)
    await tx.journalNote.updateMany({
      where: {
        journalEntry: { patientId },
      },
      data: {
        noteText: "[Conteúdo removido por solicitação LGPD]",
      },
    });

    // Clear patient contacts
    await tx.patientContact.updateMany({
      where: { patientId },
      data: {
        name: "Contato Removido",
        phone: null,
        email: null,
      },
    });

    // Clear appointment admin notes
    await tx.appointment.updateMany({
      where: { patientId },
      data: {
        adminNotes: null,
      },
    });

    // Clear charge descriptions and notes
    await tx.charge.updateMany({
      where: { patientId },
      data: {
        description: null,
        notes: null,
      },
    });

    // Clear patient preference
    if (patient.id) {
      await tx.patientPreference.deleteMany({
        where: { patientId },
      });
    }
  });
}
