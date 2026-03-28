/**
 * Psycologger — Database Seed
 * Creates demo tenant, users, patients, appointments, sessions, charges.
 * Run: npm run db:seed
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ─── Super Admin ───────────────────────────────────────────────────────────
  const superAdmin = await db.user.upsert({
    where: { email: "admin@psycologger.com" },
    update: {},
    create: {
      email: "admin@psycologger.com",
      name: "Super Admin",
      isSuperAdmin: true,
    },
  });
  console.log("✅ SuperAdmin:", superAdmin.email);

  // ─── Demo Tenant ──────────────────────────────────────────────────────────
  const tenant = await db.tenant.upsert({
    where: { slug: "demo-clinica" },
    update: {},
    create: {
      name: "Demo Clínica",
      slug: "demo-clinica",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
    },
  });
  console.log("✅ Tenant:", tenant.name);

  // ─── Psychologist ─────────────────────────────────────────────────────────
  const psy = await db.user.upsert({
    where: { email: "ana@demo.com" },
    update: {},
    create: {
      email: "ana@demo.com",
      name: "Dra. Ana Silva",
    },
  });

  await db.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: psy.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: psy.id,
      role: "PSYCHOLOGIST",
      status: "ACTIVE",
    },
  });

  // ─── TenantAdmin ──────────────────────────────────────────────────────────
  const admin = await db.user.upsert({
    where: { email: "admin@demo.com" },
    update: {},
    create: {
      email: "admin@demo.com",
      name: "Carlos Admin",
    },
  });

  await db.membership.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: admin.id } },
    update: {},
    create: {
      tenantId: tenant.id,
      userId: admin.id,
      role: "TENANT_ADMIN",
      status: "ACTIVE",
    },
  });

  // ─── Appointment Type ─────────────────────────────────────────────────────
  const apptType = await db.appointmentType.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: tenant.id,
      name: "Sessão Individual",
      defaultDurationMin: 50,
      defaultPriceCents: 25000,
      color: "#2563eb",
    },
  });

  // ─── Patients ─────────────────────────────────────────────────────────────
  const patients = await Promise.all(
    [
      { fullName: "João Silva", email: "joao@example.com", phone: "11999001001" },
      { fullName: "Maria Santos", email: "maria@example.com", phone: "11999002002" },
      { fullName: "Pedro Lima", email: "pedro@example.com", phone: "11999003003" },
      { fullName: "Carla Mendes", email: "carla@example.com", phone: "11999004004" },
      { fullName: "Bruno Costa", email: "bruno@example.com", phone: "11999005005" },
    ].map((p) =>
      db.patient.upsert({
        where: { id: generateId(p.email) },
        update: {},
        create: {
          id: generateId(p.email),
          tenantId: tenant.id,
          assignedUserId: psy.id,
          fullName: p.fullName,
          email: p.email,
          phone: p.phone,
          tags: ["demo"],
          consentGiven: true,
          consentGivenAt: new Date(),
        },
      })
    )
  );
  console.log(`✅ ${patients.length} patients created`);

  // ─── Appointments (today + upcoming) ──────────────────────────────────────
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const appointments = [];
  for (let i = 0; i < 5; i++) {
    const patient = patients[i % patients.length];
    const startsAt = new Date(today);
    startsAt.setHours(9 + i * 1, 0, 0, 0);
    const endsAt = new Date(startsAt);
    endsAt.setMinutes(50);

    const appt = await db.appointment.create({
      data: {
        tenantId: tenant.id,
        patientId: patient.id,
        providerUserId: psy.id,
        appointmentTypeId: apptType.id,
        startsAt,
        endsAt,
        status: i < 2 ? "COMPLETED" : "SCHEDULED",
      },
    });
    appointments.push(appt);
  }
  console.log(`✅ ${appointments.length} appointments created`);

  // ─── Sessions (for completed appointments) ────────────────────────────────
  for (const appt of appointments.filter((a) => a.status === "COMPLETED")) {
    const session = await db.clinicalSession.create({
      data: {
        tenantId: tenant.id,
        appointmentId: appt.id,
        patientId: appt.patientId,
        providerUserId: psy.id,
        templateKey: "SOAP",
        noteText: `**S — Subjetivo**\nPaciente relata melhora gradual dos sintomas ansiosos. Refere conseguir usar as técnicas de respiração nas situações de estresse.\n\n**O — Objetivo**\nPaciente apresentou-se calmo, com contato visual adequado e discurso fluente.\n\n**A — Avaliação**\nEvolução favorável. Paciente demonstra boa adesão ao tratamento.\n\n**P — Plano**\nContinuar trabalho com técnicas de mindfulness. Agendar retorno em 7 dias.`,
        tags: ["ansiedade", "evolução positiva"],
        sessionDate: appt.startsAt,
      },
    });

    // Create revision entry
    await db.sessionRevision.create({
      data: {
        tenantId: tenant.id,
        sessionId: session.id,
        noteText: session.noteText,
        editedById: psy.id,
      },
    });

    // Create charge
    const charge = await db.charge.create({
      data: {
        tenantId: tenant.id,
        patientId: appt.patientId,
        appointmentId: appt.id,
        sessionId: session.id,
        providerUserId: psy.id,
        amountCents: 25000,
        currency: "BRL",
        dueDate: new Date(appt.startsAt),
        status: "PAID",
        description: "Sessão individual",
      },
    });

    // Payment
    await db.payment.create({
      data: {
        tenantId: tenant.id,
        chargeId: charge.id,
        amountCents: 25000,
        method: "PIX",
        paidAt: new Date(appt.startsAt),
        createdById: psy.id,
      },
    });
  }

  // ─── Pending charges ──────────────────────────────────────────────────────
  await db.charge.create({
    data: {
      tenantId: tenant.id,
      patientId: patients[2].id,
      providerUserId: psy.id,
      amountCents: 25000,
      currency: "BRL",
      dueDate: new Date(),
      status: "PENDING",
      description: "Sessão individual — pendente",
    },
  });

  console.log("✅ Sessions, charges and payments created");
  console.log("\n🎉 Seed complete!");
  console.log("\n📧 Login credentials (use magic link):");
  console.log("   SuperAdmin: admin@psycologger.com");
  console.log("   Psicólogo:  ana@demo.com");
  console.log("   Admin:      admin@demo.com");
}

function generateId(seed: string): string {
  // Deterministic UUID-like ID from seed for upserts
  const hash = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const hex = hash.toString(16).padStart(8, "0");
  return `${hex}0000-0000-0000-0000-${seed.length.toString().padStart(12, "0")}`;
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
