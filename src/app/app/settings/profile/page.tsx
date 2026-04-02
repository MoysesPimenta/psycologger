import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { ProfileSettingsClient } from "@/components/settings/profile-settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meu Perfil" };

export default async function ProfileSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const user = await (db.user as any).findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true },
  }) as { id: string; name: string | null; email: string; phone: string | null } | null;

  if (!user) redirect("/login");

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
        <p className="text-sm text-gray-500 mt-1">Atualize seu nome, telefone e informações de contato</p>
      </div>
      <ProfileSettingsClient
        initialName={user.name ?? ""}
        email={user.email}
        initialPhone={user.phone ?? ""}
      />
    </div>
  );
}
