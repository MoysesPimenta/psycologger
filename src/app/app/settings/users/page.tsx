import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { UsersSettingsClient } from "@/components/settings/users-settings-client";

export const metadata = { title: "Usuários & Papéis" };

export default async function UsersSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Usuários & Papéis</h1>
        <p className="text-sm text-gray-500 mt-1">Convide e gerencie membros da equipe</p>
      </div>
      <UsersSettingsClient />
    </div>
  );
}
