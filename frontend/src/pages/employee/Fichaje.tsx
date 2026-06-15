import React, { useCallback, useEffect, useState } from 'react';
import {
  LogIn, LogOut, Coffee, Play, Bell, CheckCircle2, Plus, ShieldAlert, Hourglass,
} from 'lucide-react';
import { attendanceService } from '@/services/api/attendance';
import { schedulesService } from '@/services/api/schedules';
import type { AttendanceDetail, EmployeeScheduleActive } from '@/types';
import { Button, Card, Badge, FullSpinner, Modal, Field, Input } from '@/components/ui';
import { useConfirm } from '@/context/confirm';
import { useToast } from '@/context/toast';
import { formatTime, formatDuration } from '@/lib/format';

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();
const isoWeekday = (ms: number) => ((new Date(ms).getDay() + 6) % 7) + 1;
const blockMinutes = (start: string, end: string): number => {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const d = toMin(end) - toMin(start);
  return d <= 0 ? d + 1440 : d;
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo salió mal');

export const FichajePage: React.FC = () => {
  const confirm = useConfirm();
  const toast = useToast();
  const [today, setToday] = useState<AttendanceDetail | null>(null);
  const [schedule, setSchedule] = useState<EmployeeScheduleActive | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 20000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    const [recs, sched] = await Promise.all([
      attendanceService.getAll(),
      schedulesService.getMySchedule(),
    ]);
    setSchedule(sched.active);
    const todayRec = recs.find((r) => isToday(r.check_in));
    setToday(todayRec ? await attendanceService.getById(todayRec.id) : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => setLoading(false));
  }, [load]);

  if (loading) return <FullSpinner label="Cargando tu jornada…" />;

  const openPause = today?.pauses.find((p) => p.pause_end === null) ?? null;
  const isOpen = today !== null && today.check_out === null;
  const isPaused = isOpen && openPause !== null;
  const finished = today !== null && today.check_out !== null;

  const workedMin = (() => {
    if (!today) return 0;
    const ci = new Date(today.check_in).getTime();
    const end = today.check_out ? new Date(today.check_out).getTime() : now;
    const pauseMs = today.pauses.reduce((s, p) => {
      const ps = new Date(p.pause_start).getTime();
      const pe = p.pause_end ? new Date(p.pause_end).getTime() : now;
      return s + Math.max(0, pe - ps);
    }, 0);
    return Math.max(0, Math.round((end - ci - pauseMs) / 60000));
  })();

  const expectedMin = (schedule?.days ?? [])
    .filter((d) => d.weekday === isoWeekday(now))
    .reduce((s, d) => s + blockMinutes(d.start_time, d.end_time), 0);
  const progress = expectedMin > 0 ? Math.min(100, Math.round((workedMin / expectedMin) * 100)) : 0;
  const completed = expectedMin > 0 && workedMin >= expectedMin;

  const run = async (
    action: () => Promise<unknown>,
    opts: { title: string; verb: string; tone: 'success' | 'danger' | 'warning' | 'primary'; okMsg: string }
  ) => {
    const intendedAt = new Date().toISOString();
    const ok = await confirm({
      title: opts.title,
      message: `Vas a registrar ${opts.verb} a las ${formatTime(intendedAt)}. ¿Confirmar?`,
      confirmLabel: opts.title,
      tone: opts.tone,
    });
    if (!ok) return;
    try {
      await action();
      toast.success(opts.okMsg);
      await load();
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const intendedNow = () => new Date().toISOString();

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Estado principal */}
      <Card className="overflow-hidden">
        <div
          className={
            'px-5 py-6 text-white ' +
            (finished
              ? 'bg-gradient-to-br from-slate-600 to-slate-700'
              : isPaused
                ? 'bg-gradient-to-br from-amber-500 to-amber-600'
                : isOpen
                  ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                  : 'bg-gradient-to-br from-brand-500 to-brand-700')
          }
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm/none opacity-80">
                {finished ? 'Jornada finalizada' : isPaused ? 'En pausa' : isOpen ? 'Trabajando' : 'Sin fichar'}
              </p>
              <p className="text-4xl font-bold mt-2 tabular-nums">{formatDuration(workedMin)}</p>
            </div>
            <div className="text-right text-sm opacity-90 space-y-1">
              <p>Entrada {today ? formatTime(today.check_in) : '—'}</p>
              <p>Salida {today?.check_out ? formatTime(today.check_out) : '—'}</p>
            </div>
          </div>

          {expectedMin > 0 && (
            <div className="mt-5">
              <div className="flex justify-between text-xs opacity-90 mb-1.5">
                <span>Progreso de jornada</span>
                <span>{progress}% · objetivo {formatDuration(expectedMin)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/25 overflow-hidden">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Avisos de estado */}
        {today?.status === 'pending_validation' && (
          <div className="flex items-center gap-2 px-5 py-3 bg-amber-50 text-amber-800 text-sm">
            <Hourglass className="w-4 h-4 shrink-0" />
            Este registro está pendiente de validación por tu responsable.
          </div>
        )}

        {/* Acciones */}
        <div className="p-5 space-y-3">
          {!today && (
            <Button
              block size="lg" variant="success"
              onClick={() =>
                run(() => attendanceService.checkIn(intendedNow()), {
                  title: 'Marcar entrada', verb: 'tu entrada', tone: 'success', okMsg: 'Entrada registrada',
                })
              }
            >
              <LogIn className="w-5 h-5" /> Marcar entrada
            </Button>
          )}

          {isOpen && !isPaused && (
            <div className="grid grid-cols-2 gap-3">
              <Button
                size="lg" variant="warning"
                onClick={() =>
                  run(() => attendanceService.startPause(undefined, intendedNow()), {
                    title: 'Iniciar pausa', verb: 'una pausa', tone: 'warning', okMsg: 'Pausa iniciada',
                  })
                }
              >
                <Coffee className="w-5 h-5" /> Pausar
              </Button>
              <Button
                size="lg" variant="danger"
                onClick={() =>
                  run(() => attendanceService.checkOut(intendedNow()), {
                    title: 'Marcar salida', verb: 'tu salida', tone: 'danger', okMsg: 'Salida registrada',
                  })
                }
              >
                <LogOut className="w-5 h-5" /> Salir
              </Button>
            </div>
          )}

          {isPaused && (
            <Button
              block size="lg" variant="success"
              onClick={() =>
                run(() => attendanceService.endPause(intendedNow()), {
                  title: 'Reanudar', verb: 'la reanudación', tone: 'success', okMsg: 'Jornada reanudada',
                })
              }
            >
              <Play className="w-5 h-5" /> Reanudar jornada
            </Button>
          )}

          {completed && isOpen && !today?.overtime_requested && (
            <Button
              block variant="secondary"
              onClick={() =>
                run(() => attendanceService.requestOvertime(today!.id), {
                  title: 'Solicitar horas extra', verb: 'la solicitud de horas extra', tone: 'primary',
                  okMsg: 'Horas extra solicitadas',
                })
              }
            >
              <Bell className="w-4 h-4" /> Solicitar horas extra
            </Button>
          )}

          {today?.overtime_requested && !today?.overtime_approved && (
            <Badge tone="amber" className="w-full justify-center py-2">Horas extra: esperando aprobación</Badge>
          )}
          {today?.overtime_approved && (
            <Badge tone="green" className="w-full justify-center py-2">
              <CheckCircle2 className="w-4 h-4" /> Horas extra aprobadas
            </Badge>
          )}

          {finished && (
            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm py-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Has completado tu jornada de hoy
            </div>
          )}
        </div>
      </Card>

      {/* Registro olvidado */}
      <button
        onClick={() => setManualOpen(true)}
        className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-brand-600 py-2"
      >
        <Plus className="w-4 h-4" /> ¿Olvidaste fichar? Registro manual
      </button>

      {/* Pausas de hoy */}
      {today && today.pauses.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Coffee className="w-4 h-4 text-amber-500" /> Pausas de hoy
          </p>
          <ul className="space-y-1.5">
            {today.pauses.map((p) => (
              <li key={p.id} className="flex justify-between text-sm text-slate-600">
                <span>{formatTime(p.pause_start)} – {p.pause_end ? formatTime(p.pause_end) : 'en curso'}</span>
                {p.reason && <span className="text-slate-400">{p.reason}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {!schedule && (
        <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
          <ShieldAlert className="w-3.5 h-3.5" /> No tienes un horario asignado; pídeselo a tu responsable.
        </div>
      )}

      <ManualEntryModal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onDone={async () => {
          setManualOpen(false);
          toast.success('Registro manual enviado para validación');
          await load();
        }}
        onError={(m) => toast.error(m)}
      />
    </div>
  );
};

const ManualEntryModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onError: (m: string) => void;
}> = ({ open, onClose, onDone, onError }) => {
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!checkIn) return;
    setSaving(true);
    try {
      await attendanceService.createManualEntry({
        check_in: new Date(checkIn).toISOString(),
        check_out: checkOut ? new Date(checkOut).toISOString() : undefined,
        reason: reason || undefined,
      });
      setCheckIn(''); setCheckOut(''); setReason('');
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
      title="Registro olvidado"
      footer={
        <>
          <Button variant="secondary" block onClick={onClose}>Cancelar</Button>
          <Button block loading={saving} disabled={!checkIn} onClick={submit}>Enviar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Indica la hora real. Quedará <b>pendiente de validación</b> por tu responsable.
        </p>
        <Field label="Entrada">
          <Input type="datetime-local" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Salida (opcional)">
          <Input type="datetime-local" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
        <Field label="Motivo (opcional)">
          <Input placeholder="Olvidé fichar al llegar" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
};
