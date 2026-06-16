import React, { useCallback, useEffect, useState } from 'react';
import { FileText, Download, PencilLine, ShieldCheck, MapPin } from 'lucide-react';
import { attendanceService } from '@/services/api/attendance';
import type { AttendanceRecord } from '@/types';
import { Card, Button, Badge, FullSpinner, EmptyState, PageHeader, Modal, Field, Input } from '@/components/ui';
import { useToast } from '@/context/toast';
import { formatDate, formatTime, STATUS_LABELS, STATUS_TONES, SOURCE_LABELS } from '@/lib/format';

const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const AdminRegistros: React.FC = () => {
  const toast = useToast();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AttendanceRecord | null>(null);

  const load = useCallback(async () => {
    setRecords(await attendanceService.getAll());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const exportCsv = async () => {
    try {
      const blob = await attendanceService.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'asistencia.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo exportar');
    }
  };

  if (loading) return <FullSpinner label="Cargando…" />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Registros"
        subtitle={`${records.length} fichajes`}
        actions={<Button size="sm" variant="secondary" onClick={exportCsv}><Download className="w-4 h-4" /> CSV</Button>}
      />
      {records.length === 0 ? (
        <EmptyState icon={<FileText className="w-10 h-10" />} title="Sin registros" />
      ) : (
        <div className="space-y-2.5">
          {records.map((r) => (
            <Card key={r.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">{r.employee_name}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {formatDate(r.check_in)} · {formatTime(r.check_in)} – {r.check_out ? formatTime(r.check_out) : 'en curso'}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {r.status !== 'confirmed' && <Badge tone={STATUS_TONES[r.status]}>{STATUS_LABELS[r.status]}</Badge>}
                  {r.source === 'manual' && <Badge tone="blue"><PencilLine className="w-3 h-3" /> {SOURCE_LABELS.manual}</Badge>}
                  {r.source === 'system' && <Badge tone="slate"><ShieldCheck className="w-3 h-3" /> {SOURCE_LABELS.system}</Badge>}
                  {(r.check_in_outside || r.check_out_outside) && <Badge tone="red"><MapPin className="w-3 h-3" /> Fuera de zona</Badge>}
                  {r.check_in_lat != null && r.check_in_lng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${r.check_in_lat},${r.check_in_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-xs font-medium hover:bg-slate-200"
                    >
                      <MapPin className="w-3 h-3" /> Ubicación
                    </a>
                  )}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                <PencilLine className="w-4 h-4" /> Corregir
              </Button>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <CorrectModal
          record={editing}
          onClose={() => setEditing(null)}
          onDone={async () => { setEditing(null); toast.success('Registro corregido'); await load(); }}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
};

const CorrectModal: React.FC<{
  record: AttendanceRecord; onClose: () => void; onDone: () => void; onError: (m: string) => void;
}> = ({ record, onClose, onDone, onError }) => {
  const [checkIn, setCheckIn] = useState(() => toLocalInput(record.check_in));
  const [checkOut, setCheckOut] = useState(() => toLocalInput(record.check_out));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (reason.trim().length < 3) return;
    setSaving(true);
    try {
      await attendanceService.correct(record.id, {
        check_in: checkIn ? new Date(checkIn).toISOString() : undefined,
        check_out: checkOut ? new Date(checkOut).toISOString() : null,
        reason,
      });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo corregir');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open onClose={onClose} title={`Corregir · ${record.employee_name}`}
      footer={<><Button variant="secondary" block onClick={onClose}>Cancelar</Button>
        <Button block loading={saving} disabled={reason.trim().length < 3} onClick={submit}>Guardar</Button></>}
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          El valor anterior se conserva en la auditoría. El motivo es obligatorio.
        </p>
        <Field label="Entrada"><Input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} /></Field>
        <Field label="Salida"><Input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} /></Field>
        <Field label="Motivo"><Input placeholder="Corrección por…" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
};
