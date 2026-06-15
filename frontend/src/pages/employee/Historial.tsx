import React, { useEffect, useState } from 'react';
import { History, Clock, ShieldCheck, PencilLine } from 'lucide-react';
import { attendanceService } from '@/services/api/attendance';
import type { AttendanceRecord } from '@/types';
import { Card, Badge, FullSpinner, EmptyState, PageHeader } from '@/components/ui';
import { formatTime, formatDate, formatDuration, STATUS_LABELS, STATUS_TONES, SOURCE_LABELS } from '@/lib/format';

const grossMinutes = (r: AttendanceRecord): number | null =>
  r.check_out
    ? Math.round((new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000)
    : null;

export const HistorialPage: React.FC = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    attendanceService
      .getAll()
      .then(setRecords)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <FullSpinner label="Cargando tu historial…" />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Mi historial" subtitle={`${records.length} registros`} />
      {records.length === 0 ? (
        <EmptyState icon={<History className="w-10 h-10" />} title="Aún no tienes fichajes" />
      ) : (
        <div className="space-y-2.5">
          {records.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{formatDate(r.check_in)}</p>
                  <p className="text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    {formatTime(r.check_in)} – {r.check_out ? formatTime(r.check_out) : 'en curso'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900 tabular-nums">
                    {formatDuration(grossMinutes(r))}
                  </p>
                  <div className="flex gap-1 justify-end mt-1">
                    {r.status !== 'confirmed' && (
                      <Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge>
                    )}
                    {r.source === 'manual' && (
                      <Badge tone="blue"><PencilLine className="w-3 h-3" /> {SOURCE_LABELS.manual}</Badge>
                    )}
                    {r.source === 'system' && (
                      <Badge tone="slate"><ShieldCheck className="w-3 h-3" /> {SOURCE_LABELS.system}</Badge>
                    )}
                    {r.overtime_approved && <Badge tone="green">Horas extra</Badge>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
