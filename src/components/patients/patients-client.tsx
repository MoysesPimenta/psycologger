"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, User, Phone, Mail, Tag, ChevronRight, EyeOff, Eye } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, initials } from "@/lib/utils";

interface Patient {
  id: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  isActive: boolean;
  createdAt: string;
  assignedUser: { id: string; name: string | null } | null;
  _count: { appointments: number; charges: number };
}

export function PatientsClient() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [search, setSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [showInactive, setShowInactive] = useState(false);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setFetchError("");
    const params = new URLSearchParams({
      q: search,
      page: page.toString(),
      pageSize: "20",
      active: showInactive ? "all" : "true",
    });
    try {
      const res = await fetch(`/api/v1/patients?${params}`);
      if (res.ok) {
        const json = await res.json();
        setPatients(json.data);
        setTotal(json.meta?.total ?? 0);
      } else {
        setFetchError("Erro ao carregar pacientes. Tente novamente.");
      }
    } catch {
      setFetchError("Erro de conexão. Tente novamente.");
    }
    setLoading(false);
  }, [search, page, showInactive]);

  useEffect(() => {
    const t = setTimeout(() => fetch_(), 300);
    return () => clearTimeout(t);
  }, [fetch_]);

  return (
    <div className="space-y-4">
      {/* Search bar + inactive toggle */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Buscar por nome, email ou telefone..."
            className="pl-9"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Button
          variant={showInactive ? "default" : "outline"}
          size="sm"
          onClick={() => { setShowInactive((v) => !v); setPage(1); }}
          title={showInactive ? "Ocultar inativos" : "Mostrar inativos"}
          className="flex-shrink-0 gap-1.5"
        >
          {showInactive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {showInactive ? "Ocultar inativos" : "Ver inativos"}
        </Button>
      </div>

      {fetchError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={() => fetch_()} className="text-red-600 underline text-xs ml-4">Tentar novamente</button>
        </div>
      )}

      {/* Results count */}
      <p className="text-sm text-gray-500">{total} paciente{total !== 1 ? "s" : ""} encontrado{total !== 1 ? "s" : ""}</p>

      {/* List */}
      <div className="space-y-2">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-4 animate-pulse h-20" />
          ))
        ) : patients.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <User className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {search ? "Nenhum paciente encontrado para esta busca." : "Nenhum paciente cadastrado ainda."}
            </p>
          </div>
        ) : (
          patients.map((patient) => (
            <Link
              key={patient.id}
              href={`/app/patients/${patient.id}`}
              className="flex items-center gap-4 bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow group"
            >
              {/* Avatar */}
              <div className="w-10 h-10 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">
                {initials(patient.fullName)}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">
                    {patient.preferredName ?? patient.fullName}
                  </span>
                  {patient.preferredName && (
                    <span className="text-xs text-gray-400">({patient.fullName})</span>
                  )}
                  {!patient.isActive && (
                    <Badge variant="secondary" className="text-xs">Arquivado</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-0.5 text-xs text-gray-500">
                  {patient.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {patient.email}
                    </span>
                  )}
                  {patient.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {patient.phone}
                    </span>
                  )}
                  <span>{patient._count.appointments} consulta{patient._count.appointments !== 1 ? "s" : ""}</span>
                </div>
                {patient.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {patient.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="inline-flex items-center gap-0.5 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        <Tag className="h-2.5 w-2.5" /> {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
            </Link>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Anterior
          </Button>
          <span className="text-sm text-gray-500 flex items-center px-2">
            Página {page} de {Math.ceil(total / 20)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={page * 20 >= total}
          >
            Próxima
          </Button>
        </div>
      )}
    </div>
  );
}
