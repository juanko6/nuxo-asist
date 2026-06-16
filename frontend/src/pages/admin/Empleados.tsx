import React, { useCallback, useEffect, useState } from 'react';
import { Users, Plus, CalendarRange, UserX, RotateCcw } from 'lucide-react';
import { employeesService } from '@/services/api/employees';
import { schedulesService } from '@/services/api/schedules';
import type { User, UserStatus, ScheduleTemplateSummary, EmployeeScheduleView } from '@/types';
import { Card, Button, Badge, FullSpinner, EmptyState, PageHeader, Modal, Field, Input, Select, cn } from '@/components/ui';
import { useToast } from '@/context/toast';
import { useConfirm } from '@/context/confirm';
import { formatDuration, formatDate } from '@/lib/format';

export const AdminEmpleados: React.FC = () => {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Extract<UserStatus, 'active' | 'inactive'>>('active');
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<User | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setEmployees(await employeesService.getAll(tab));
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const archive = async (e: User) => {
    const ok = await confirm({
      title: 'Dar de baja',
      message: `¿Dar de baja a ${e.name}? Se conserva su historial (retención legal) y podrás reactivarlo cuando quieras. No podrá iniciar sesión.`,
      confirmLabel: 'Dar de baja',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await employeesService.archive(e.id);
      toast.success('Empleado dado de baja');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo dar de baja');
    }
  };

  const restore = async (e: User) => {
    try {
      await employeesService.restore(e.id);
      toast.success('Empleado reactivado');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo reactivar');
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Empleados"
        subtitle={tab === 'active' ? `${employees.length} en plantilla` : `${employees.length} de baja`}
        actions={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /> Nuevo</Button>}
      />

      <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-4 w-fit">
        {(['active', 'inactive'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 rounded-lg text-sm font-medium transition',
              tab === t ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
            )}
          >
            {t === 'active' ? 'Activos' : 'Bajas'}
          </button>
        ))}
      </div>

      {loading ? (
        <FullSpinner label="Cargando…" />
      ) : employees.length === 0 ? (
        <EmptyState
          icon={<Users className="w-10 h-10" />}
          title={tab === 'active' ? 'Sin empleados activos' : 'No hay bajas'}
        />
      ) : (
        <div className="space-y-2.5">
          {employees.map((e) => (
            <Card key={e.id} className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'grid place-items-center w-10 h-10 rounded-full font-semibold',
                    tab === 'active' ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-400'
                  )}
                >
                  {e.name.charAt(0)}
                </div>
                <div>
                  <p className="font-semibold text-slate-800">{e.name}</p>
                  <p className="text-xs text-slate-500">{e.position} · {e.department}</p>
                </div>
              </div>
              {tab === 'active' ? (
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setScheduleFor(e)}>
                    <CalendarRange className="w-4 h-4" /> Horario
                  </Button>
                  <button
                    onClick={() => archive(e)}
                    title="Dar de baja"
                    className="grid place-items-center w-9 h-9 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <UserX className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Badge tone="slate">Baja</Badge>
                  <Button size="sm" variant="secondary" onClick={() => restore(e)}>
                    <RotateCcw className="w-4 h-4" /> Reactivar
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <CreateEmployeeModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onDone={async () => { setCreateOpen(false); toast.success('Empleado creado'); await load(); }}
        onError={(m) => toast.error(m)}
      />
      {scheduleFor && (
        <ScheduleModal
          employee={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onDone={(m) => toast.success(m)}
          onError={(m) => toast.error(m)}
        />
      )}
    </div>
  );
};

const CreateEmployeeModal: React.FC<{
  open: boolean; onClose: () => void; onDone: () => void; onError: (m: string) => void;
}> = ({ open, onClose, onDone, onError }) => {
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '', position: '' });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setSaving(true);
    try {
      await employeesService.create(form);
      setForm({ name: '', email: '', password: '', department: '', position: '' });
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setSaving(false);
    }
  };

  const valid = form.name && form.email && form.password.length >= 8 && form.department && form.position;

  return (
    <Modal
      open={open} onClose={onClose} title="Nuevo empleado"
      footer={<><Button variant="secondary" block onClick={onClose}>Cancelar</Button>
        <Button block loading={saving} disabled={!valid} onClick={submit}>Crear</Button></>}
    >
      <div className="space-y-3">
        <Field label="Nombre"><Input value={form.name} onChange={set('name')} /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Contraseña" hint="Mínimo 8 caracteres"><Input type="password" value={form.password} onChange={set('password')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Departamento"><Input value={form.department} onChange={set('department')} /></Field>
          <Field label="Puesto"><Input value={form.position} onChange={set('position')} /></Field>
        </div>
      </div>
    </Modal>
  );
};

const ScheduleModal: React.FC<{
  employee: User; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void;
}> = ({ employee, onClose, onDone, onError }) => {
  const [view, setView] = useState<EmployeeScheduleView | null>(null);
  const [templates, setTemplates] = useState<ScheduleTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [v, t] = await Promise.all([
      schedulesService.getEmployeeSchedule(employee.id),
      schedulesService.getTemplates(),
    ]);
    setView(v);
    setTemplates(t);
  }, [employee.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const assign = async () => {
    if (!templateId) return;
    setSaving(true);
    try {
      await schedulesService.assignSchedule(employee.id, { template_id: templateId, valid_from: validFrom });
      onDone('Horario asignado');
      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo asignar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Horario · ${employee.name}`}>
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          {view?.active ? (
            <>
              <p className="font-medium text-slate-800">{view.active.template_name}</p>
              <p className="text-slate-500">
                {formatDuration(view.active.weekly_minutes)}/semana · desde {formatDate(view.active.valid_from)}
              </p>
            </>
          ) : (
            <p className="text-slate-500">Sin horario asignado</p>
          )}
        </div>

        <div className="space-y-3">
          <Field label="Asignar plantilla">
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Selecciona…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name} · {formatDuration(t.weekly_minutes)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Vigente desde">
            <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          </Field>
          <Button block loading={saving} disabled={!templateId} onClick={assign}>Asignar horario</Button>
        </div>

        {view && view.history.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Historial</p>
            <ul className="space-y-1 text-sm">
              {view.history.map((h) => (
                <li key={h.id} className="flex justify-between text-slate-600">
                  <span>{h.template_name}</span>
                  <Badge tone={h.valid_to ? 'slate' : 'green'}>
                    {formatDate(h.valid_from)}{h.valid_to ? ` → ${formatDate(h.valid_to)}` : ' · activo'}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};
