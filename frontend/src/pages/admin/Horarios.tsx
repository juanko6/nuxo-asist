import React, { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Plus, Trash2 } from 'lucide-react';
import { schedulesService } from '@/services/api/schedules';
import type { ScheduleTemplateSummary, ScheduleTemplateDay } from '@/types';
import { Card, Button, Badge, FullSpinner, EmptyState, PageHeader, Modal, Field, Input } from '@/components/ui';
import { useToast } from '@/context/toast';
import { formatDuration, WEEKDAYS } from '@/lib/format';

export const AdminHorarios: React.FC = () => {
  const toast = useToast();
  const [templates, setTemplates] = useState<ScheduleTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setTemplates(await schedulesService.getTemplates());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const remove = async (id: string) => {
    try {
      await schedulesService.deleteTemplate(id);
      toast.success('Plantilla eliminada');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo eliminar');
    }
  };

  if (loading) return <FullSpinner label="Cargando…" />;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Horarios"
        subtitle="Plantillas de jornada"
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4" /> Nueva</Button>}
      />
      {templates.length === 0 ? (
        <EmptyState icon={<CalendarRange className="w-10 h-10" />} title="Sin plantillas" hint="Crea una plantilla para asignarla a tus empleados." />
      ) : (
        <div className="space-y-2.5">
          {templates.map((t) => (
            <Card key={t.id} className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-800">{t.name}</p>
                {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone="brand">{formatDuration(t.weekly_minutes)}/sem</Badge>
                <button onClick={() => remove(t.id)} className="text-slate-300 hover:text-rose-500 p-1">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateTemplateModal
        open={open}
        onClose={() => setOpen(false)}
        onDone={async () => { setOpen(false); toast.success('Plantilla creada'); await load(); }}
        onError={(m) => toast.error(m)}
      />
    </div>
  );
};

interface DayRow {
  enabled: boolean;
  start: string;
  end: string;
}

const CreateTemplateModal: React.FC<{
  open: boolean; onClose: () => void; onDone: () => void; onError: (m: string) => void;
}> = ({ open, onClose, onDone, onError }) => {
  const [name, setName] = useState('');
  const [days, setDays] = useState<DayRow[]>(() =>
    WEEKDAYS.map((_, i) => ({ enabled: i < 5, start: '09:00', end: '17:00' }))
  );
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<DayRow>) =>
    setDays((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));

  const submit = async () => {
    const payload: ScheduleTemplateDay[] = days
      .map((d, i) => ({ ...d, weekday: i + 1 }))
      .filter((d) => d.enabled)
      .map((d) => ({ weekday: d.weekday, start_time: d.start, end_time: d.end }));
    if (!name || payload.length === 0) return;
    setSaving(true);
    try {
      await schedulesService.createTemplate({ name, days: payload });
      setName('');
      onDone();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo crear');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open} onClose={onClose} title="Nueva plantilla de horario"
      footer={<><Button variant="secondary" block onClick={onClose}>Cancelar</Button>
        <Button block loading={saving} disabled={!name} onClick={submit}>Crear</Button></>}
    >
      <div className="space-y-4">
        <Field label="Nombre"><Input placeholder="Jornada completa L-V" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">Días y horas</p>
          <div className="space-y-1.5">
            {WEEKDAYS.map((label, i) => (
              <div key={label} className={'flex items-center gap-2 rounded-xl px-2 py-1.5 ' + (days[i]!.enabled ? 'bg-brand-50' : 'bg-slate-50')}>
                <label className="flex items-center gap-2 w-16 cursor-pointer">
                  <input type="checkbox" checked={days[i]!.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} className="accent-brand-600" />
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                </label>
                {days[i]!.enabled ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input type="time" value={days[i]!.start} onChange={(e) => update(i, { start: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-2 h-9 text-sm" />
                    <span className="text-slate-400">–</span>
                    <input type="time" value={days[i]!.end} onChange={(e) => update(i, { end: e.target.value })} className="flex-1 rounded-lg border border-slate-200 px-2 h-9 text-sm" />
                  </div>
                ) : (
                  <span className="text-sm text-slate-400 flex-1">Libre</span>
                )}
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-2">Si la hora de fin es menor que la de inicio, se interpreta como turno nocturno.</p>
        </div>
      </div>
    </Modal>
  );
};
