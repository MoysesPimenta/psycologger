"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { fetchWithCsrf } from "@/lib/csrf-client";

interface AppointmentTypeSummary {
  id: string;
  name: string;
  defaultPriceCents: number;
}

interface Provider {
  id: string;
  name: string | null;
}

interface PatientData {
  id: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
  cpf: string | null;
  notes: string | null;
  tags: string[];
  isActive: boolean;
  consentGiven: boolean;
  assignedUserId: string | null;
  defaultAppointmentTypeId: string | null;
  defaultFeeOverrideCents: number | null;
}

export function EditPatientClient({
  patient,
  appointmentTypes = [],
  providers = [],
}: {
  patient: PatientData;
  appointmentTypes?: AppointmentTypeSummary[];
  providers?: Provider[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const t = useTranslations("patients");
  const [loading, setLoading] = useState(false);

  const dobStr = patient.dob
    ? new Date(patient.dob).toISOString().split("T")[0]
    : "";

  const [form, setForm] = useState({
    fullName: patient.fullName,
    preferredName: patient.preferredName ?? "",
    email: patient.email ?? "",
    phone: patient.phone ?? "",
    dob: dobStr,
    cpf: patient.cpf ?? "",
    notes: patient.notes ?? "",
    tags: patient.tags.join(", "),
    consentGiven: patient.consentGiven,
    assignedUserId: patient.assignedUserId ?? "",
    defaultAppointmentTypeId: patient.defaultAppointmentTypeId ?? "",
    defaultFeeOverrideCents: patient.defaultFeeOverrideCents
      ? (patient.defaultFeeOverrideCents / 100).toFixed(2)
      : "",
  });

  function set(field: string, value: string | boolean) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  const selectedType = appointmentTypes.find(
    (t) => t.id === form.defaultAppointmentTypeId
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const feeVal =
        typeof form.defaultFeeOverrideCents === "string"
          ? form.defaultFeeOverrideCents.trim()
          : "";
      const feeCents = feeVal
        ? Math.round(parseFloat(feeVal.replace(",", ".")) * 100)
        : null;

      const res = await fetchWithCsrf(`/api/v1/patients/${patient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          preferredName: form.preferredName || null,
          email: form.email || null,
          phone: form.phone || null,
          cpf: form.cpf || null,
          dob: form.dob || null,
          notes: form.notes || null,
          tags: form.tags
            ? form.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
          consentGiven: form.consentGiven,
          assignedUserId: form.assignedUserId || null,
          defaultAppointmentTypeId: form.defaultAppointmentTypeId || null,
          defaultFeeOverrideCents: feeCents,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = typeof body?.error === "string" ? body.error : body?.message ?? t("saveError");
        throw new Error(msg);
      }

      const resData = await res.json().catch(() => null);
      toast({ title: t("patientUpdated"), variant: "success" });

      // If the email changed and portal invite was sent, notify the user
      if (resData?.data?.portalEmailSynced) {
        toast({
          title: t("portalLinkSent"),
          description: `${t("portalLinkSentMessage")} ${form.email}`,
          variant: "success",
        });
      }

      router.push(`/app/patients/${patient.id}`);
      router.refresh();
    } catch (err) {
      toast({
        title: err instanceof Error ? err.message : t("updateError"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Personal info ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t("fullName")} *</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                required
                minLength={2}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferredName">{t("preferredName")}</Label>
              <Input
                id="preferredName"
                value={form.preferredName}
                onChange={(e) => set("preferredName", e.target.value)}
                maxLength={50}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t("phone")}</Label>
              <PhoneInput
                id="phone"
                value={form.phone}
                onChange={(v) => set("phone", v)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dob">{t("dateOfBirth")}</Label>
              <Input
                id="dob"
                type="date"
                value={form.dob}
                onChange={(e) => set("dob", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cpf">{t("cpf")}</Label>
              <Input
                id="cpf"
                value={form.cpf}
                onChange={(e) => set("cpf", e.target.value)}
                placeholder="000.000.000-00"
                maxLength={14}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags">{t("tags")}</Label>
            <Input
              id="tags"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder={t("placeholderTags")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t("notes")}</Label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder={t("placeholderNotes")}
              maxLength={500}
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
            />
          </div>

          {/* ── Provider ── */}
          {providers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="assignedUserId">{t("assignedPsychologist")}</Label>
              <select
                id="assignedUserId"
                value={form.assignedUserId}
                onChange={(e) => set("assignedUserId", e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">{t("noSelection")}</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Consent ── */}
          <div className="flex items-center gap-2">
            <input
              id="consentGiven"
              type="checkbox"
              checked={form.consentGiven}
              onChange={(e) => set("consentGiven", e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="consentGiven" className="font-normal cursor-pointer">
              {t("consent")}
            </Label>
          </div>

          {/* ── Billing defaults ── */}
          {appointmentTypes.length > 0 && (
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">
                {t("defaultChargingSection")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="defaultAppointmentTypeId"
                    className="text-xs text-gray-600"
                  >
                    {t("defaultAppointmentType")}
                  </Label>
                  <select
                    id="defaultAppointmentTypeId"
                    value={form.defaultAppointmentTypeId}
                    onChange={(e) => {
                      const typeId = e.target.value;
                      const type = appointmentTypes.find((t) => t.id === typeId);
                      set("defaultAppointmentTypeId", typeId);
                      if (type && !form.defaultFeeOverrideCents) {
                        set(
                          "defaultFeeOverrideCents",
                          (type.defaultPriceCents / 100).toFixed(2)
                        );
                      }
                    }}
                    className="w-full border rounded-md px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">{t("noSelection")}</option>
                    {appointmentTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} · R${" "}
                        {(t.defaultPriceCents / 100)
                          .toFixed(2)
                          .replace(".", ",")}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="defaultFeeOverrideCents"
                    className="text-xs text-gray-600"
                  >
                    {t("sessionFeeValue")}
                    {selectedType && !form.defaultFeeOverrideCents && (
                      <span className="ml-1 font-normal text-gray-400">
                        {t("sessionFeeDefault")} R${" "}
                        {(selectedType.defaultPriceCents / 100)
                          .toFixed(2)
                          .replace(".", ",")}
                      </span>
                    )}
                  </Label>
                  <Input
                    id="defaultFeeOverrideCents"
                    type="text"
                    inputMode="decimal"
                    placeholder={
                      selectedType
                        ? (selectedType.defaultPriceCents / 100).toFixed(2)
                        : "0,00"
                    }
                    value={form.defaultFeeOverrideCents}
                    onChange={(e) =>
                      set("defaultFeeOverrideCents", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* ── Actions ── */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
            >
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t("saving") : t("saveChanges")}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
