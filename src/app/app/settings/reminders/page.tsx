import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { RemindersClient } from "@/components/settings/reminders-client";

export const metadata = { title: "Lembretes" };

export default async function RemindersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Lembretes</h1>
        <p className="text-sm text-gray-500 mt-1">
          Configure os emails automáticos enviados aos pacientes
        </p>
      </div>
      <RemindersClient />
    </div>
  );
}
