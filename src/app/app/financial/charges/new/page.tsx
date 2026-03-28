import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { NewChargeClient } from "@/components/financial/new-charge-client";

export const metadata = { title: "Nova Cobrança" };

export default async function NewChargePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nova Cobrança</h1>
        <p className="text-sm text-gray-500 mt-1">Registre uma nova cobrança para um paciente</p>
      </div>
      <NewChargeClient />
    </div>
  );
}
