import React, { useCallback, useEffect, useState } from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { absencesService } from '@/services/api/absences';
import { employeesService } from '@/services/api/employees';
import type { Absence, AbsenceType, User } from '@/types';
import { Card, Button, Badge, FullSpinner, EmptyState, PageHeader, Modal, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/context/toast';
import { useConfirm } from '@/context/confirm';
import { formatDate, ABSENCE_LABELS } from '@/lib/format';

const TYPE_TONES: Record<AbsenceType, 'green' | 'red' | 'blue' | 'slate'> = {
  vacation: 'green', sick_leave: 'red', leave: 'blue', other: 'slate',
};

export const AdminAusencias: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const [a, e] = await Promise.all([absencesService.getAll(), employeesService.getAll()]);
    setAbsences(a);
    setEmployees(e);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const nameOf = (id: string) => employees.find((e) => e.id === id)?.name ?? '—';

  const remove = async (a: Absence) => {
    const ok = await confirm({
      title: 'Eliminar ausencia',
      message: `¿Eliminar la ausencia de ${nameOf(a.employee_id)} (${ABSENCE_LABELS[a.type]}, ${formatDate(a.start_date)} → ${formatDate(a.end_date)})? Esta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await absencesService.delete(a.id);
      toast.success('Ausencia eliminada');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  if (loading) return <FullSpinner label="Cargando…" />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Ausencias"
        subtitle="Vacaciones, bajas y permisos"
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Nueva</Button>}
      />
      {absences.length === 0 ? (
        <EmptyState icon={<CalendarOff className="w-10 h-10" />} title="Sin ausencias registradas" />
      ) : (
        <div className="space-y-2.5">
          {absences.map((a) => (
            <Card key={a.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">{nameOf(a.employee_id)}</p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {formatDate(a.start_date)} → {formatDate(a.end_date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={TYPE_TONES[a.type]}>{ABSENCE_LABELS[a.type]}</Badge>
                <button onClick={() => remove(a)} className="text-slate-300 hover:text-rose-500 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateAbsenceModal
        open={open}
        employees={employees}
        onClose={() => setOpen(false)}
        onDone={async () => { setOpen(false); toast.success('Ausencia registrada'); await load(); }}
        onError={(m) => toast.error(m)}
      />
    </div>
  );
};

const CreateAbsenceModal: React.FC<{
  open: boolean;
  employees: User[];
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}> = ({ open, employees, onClose, onDone, onError }) => {
  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<AbsenceType>('vacation');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!employeeId || !start || !end) return;
    setSaving(true);
    try {
      await absencesService.create({ employee_id: employeeId, type, start_date: start, end_date: end, reason: reason || undefined });
      setEmployeeId(''); setStart(''); setEnd(''); setReason('');
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo registrar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva ausencia"
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>Cancelar</Button>
          <Button block loading={saving} disabled={!employeeId || !start || !end} onClick={submit}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Empleado">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Selecciona…</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </Select>
        </Field>
        <Field label="Tipo">
          <Select value={type} onChange={(e) => setType(e.target.value as AbsenceType)}>
            {Object.entries(ABSENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Desde"><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Hasta"><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <Field label="Motivo (opcional)">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};
