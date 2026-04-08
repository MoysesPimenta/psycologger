import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ProfileSettingsClient } from "@/components/settings/profile-settings-client";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("settings");
  return { title: t("profileTitle") };
}

export default async function ProfileSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true },
  });

  if (!user) redirect("/login");

  const t = await getTranslations("settings");

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("profileTitle")}</h1>
        <p className="text-sm text-gray-500 mt-1">{t("profileSubtitle")}</p>
      </div>
      <ProfileSettingsClient
        initialName={user.name ?? ""}
        email={user.email}
        initialPhone={user.phone ?? ""}
      />
    </div>
  );
}
