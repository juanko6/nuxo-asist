import React, { useCallback, useEffect, useState } from 'react';
import { CheckSquare, Check, X, Clock } from 'lucide-react';
import { attendanceService } from '@/services/api/attendance';
import type { AttendanceRecord } from '@/types';
import { Card, Button, FullSpinner, EmptyState, PageHeader, Badge } from '@/components/ui';
import { useToast } from '@/context/toast';
import { formatDate, formatTime } from '@/lib/format';

export const AdminValidaciones: React.FC = () => {
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const all = await attendanceService.getAll();
    setRecords(all.filter((r) => r.status === 'pending_validation'));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    setBusy(id);
    try {
      await attendanceService.validate(id, { decision });
      toast.success(decision === 'approve' ? 'Registro aprobado' : 'Registro rechazado');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <FullSpinner label="Cargando…" />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Validaciones" subtitle="Entradas manuales pendientes" />
      {records.length === 0 ? (
        <EmptyState icon={<CheckSquare className="w-10 h-10" />} title="Nada pendiente de validar" hint="Las entradas manuales aparecerán aquí." />
      ) : (
        <div className="space-y-2.5">
          {records.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold text-slate-800">{r.employee_name}</p>
                  <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Clock className="w-3.5 h-3.5" />
                    {formatDate(r.check_in)} · {formatTime(r.check_in)} – {r.check_out ? formatTime(r.check_out) : 'sin salida'}
                  </p>
                </div>
                <Badge tone="blue">Manual</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" loading={busy === r.id} onClick={() => decide(r.id, 'reject')}>
                  <X className="w-4 h-4" /> Rechazar
                </Button>
                <Button variant="success" loading={busy === r.id} onClick={() => decide(r.id, 'approve')}>
                  <Check className="w-4 h-4" /> Aprobar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
