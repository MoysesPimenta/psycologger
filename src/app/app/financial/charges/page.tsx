import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChargesClient } from "@/components/financial/charges-client";

export const metadata = { title: "Cobranças" };

export default async function ChargesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobranças</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie cobranças e pagamentos</p>
        </div>
        <Button asChild>
          <Link href="/app/financial/charges/new">
            <Plus className="h-4 w-4" /> Nova cobrança
          </Link>
        </Button>
      </div>
      <ChargesClient />
    </div>
  );
}
