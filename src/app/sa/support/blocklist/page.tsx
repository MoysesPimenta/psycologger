import Link from "next/link";
import { ArrowLeft, Shield } from "lucide-react";
import { requireSuperAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { BlocklistManager } from "@/components/sa/blocklist-manager";

export const metadata = { title: "Blocklist — Suporte" };
export const dynamic = "force-dynamic";

export default async function BlocklistPage() {
  await requireSuperAdmin();

  const entries = await db.supportBlocklist.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      kind: true,
      pattern: true,
      reason: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/sa/support" className="text-gray-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-brand-400" />
          <div>
            <h1 className="text-2xl font-bold">Blocklist de suporte</h1>
            <p className="text-gray-400 text-sm">
              Endereços e domínios bloqueados no webhook de entrada.
            </p>
          </div>
        </div>
      </div>

      <BlocklistManager
        entries={entries.map((e) => ({
          ...e,
          createdAt: e.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
