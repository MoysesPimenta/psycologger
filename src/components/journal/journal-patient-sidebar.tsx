'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Search, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PatientSummary {
  patientId: string;
  fullName: string;
  preferredName: string | null;
  unreadCount: number;
  flaggedCount: number;
  discussCount: number;
  totalShared: number;
  lastEntryAt: string | null;
  latestMoodScore: number | null;
}

interface Props {
  patients: PatientSummary[];
  selectedPatientId: string | null;
  onSelectPatient: (patientId: string | null) => void;
  loading: boolean;
}

export function JournalPatientSidebar({
  patients,
  selectedPatientId,
  onSelectPatient,
  loading,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPatients = patients.filter((patient) => {
    const displayName = patient.preferredName || patient.fullName;
    return displayName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const getMoodColor = (score: number | null) => {
    if (score === null) return '';
    if (score >= 7) return 'text-green-500';
    if (score >= 4) return 'text-amber-500';
    return 'text-red-500';
  };

  const getTimeAgo = (dateString: string | null) => {
    if (!dateString) return '';
    return formatDistanceToNow(new Date(dateString), {
      addSuffix: false,
      locale: ptBR,
    });
  };

  return (
    <div className="flex flex-col h-full bg-white border rounded-xl overflow-hidden">
      {/* Search Input */}
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
          <input
            type="text"
            placeholder="Buscar paciente..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* Todos Button */}
      <div className="px-3 py-2 border-b">
        <button
          onClick={() => onSelectPatient(null)}
          className={cn(
            'w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors',
            selectedPatientId === null
              ? 'bg-brand-50 text-brand-700'
              : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
          )}
        >
          Todos
        </button>
      </div>

      {/* Patient List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          // Skeleton loading state
          <div className="space-y-0">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="px-4 py-3 border-b last:border-b-0 animate-pulse"
              >
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
                <div className="h-4 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : filteredPatients.length === 0 ? (
          // Empty state
          <div className="flex items-center justify-center h-full text-gray-500 text-sm px-4 py-8">
            {searchQuery
              ? 'Nenhum paciente encontrado'
              : 'Nenhum paciente com entradas compartilhadas.'}
          </div>
        ) : (
          // Patient list
          <div className="space-y-0">
            {filteredPatients.map((patient) => {
              const displayName = patient.preferredName || patient.fullName;
              const isSelected = selectedPatientId === patient.patientId;

              return (
                <button
                  key={patient.patientId}
                  onClick={() => onSelectPatient(patient.patientId)}
                  className={cn(
                    'w-full px-4 py-3 border-b last:border-b-0 cursor-pointer transition-colors text-left',
                    isSelected
                      ? 'ring-2 ring-brand-500 bg-brand-50'
                      : 'hover:bg-gray-50'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-gray-900 truncate">
                          {displayName}
                        </h3>
                        {patient.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500 text-white whitespace-nowrap">
                            {patient.unreadCount}
                          </span>
                        )}
                        {patient.flaggedCount > 0 && (
                          <AlertTriangle
                            size={16}
                            className="text-red-500 flex-shrink-0"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                        {patient.latestMoodScore !== null && (
                          <span className={getMoodColor(patient.latestMoodScore)}>
                            Humor: {patient.latestMoodScore}/10
                          </span>
                        )}
                        {patient.lastEntryAt && (
                          <span className="text-gray-500">
                            há {getTimeAgo(patient.lastEntryAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
