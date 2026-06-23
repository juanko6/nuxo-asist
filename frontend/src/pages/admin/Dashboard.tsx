import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users, LogIn, CheckSquare, Bell, AlertTriangle, ChevronRight,
  Clock, CalendarOff, Info, X, ThumbsUp,
} from 'lucide-react';
import { employeesService } from '@/services/api/employees';
import { attendanceService } from '@/services/api/attendance';
import { notificationsService } from '@/services/api/notifications';
import { absencesService } from '@/services/api/absences';
import { loginLogsService } from '@/services/api/loginLogs';
import type { AttendanceRecord, Notification, User, Absence, LoginLog } from '@/types';
import { Card, FullSpinner, PageHeader } from '@/components/ui';
import { useToast } from '@/context/toast';
import { formatDate, formatTime } from '@/lib/format';
import {
  StatTiles, PresenceWidget, TodayPunchesWidget, AbsencesWidget, FlagsWidget,
  RecentLoginsWidget, DepartmentsWidget, WidgetCard,
  type StatTile, type PunchEvent, type AbsenceItem,
} from '@/components/dashboard/widgets';

// ── Helpers de fecha (zona local del navegador) ──────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// ── Notificaciones: metadatos por tipo ───────────────────────────────────────
const NOTIF_META: Record<
  Notification['type'],
  { label: string; icon: React.ReactNode; color: string }
> = {
  overtime_request: { label: 'Solicitud de horas extra', icon: <Clock className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50' },
  absence: { label: 'Ausencia sin justificar', icon: <CalendarOff className="w-4 h-4" />, color: 'text-rose-600 bg-rose-50' },
  info: { label: 'Aviso del sistema', icon: <Info className="w-4 h-4" />, color: 'text-slate-500 bg-slate-100' },
  approval: { label: 'Aprobación', icon: <ThumbsUp className="w-4 h-4" />, color: 'text-brand-600 bg-brand-50' },
};

export const AdminDashboard: React.FC = () => {
  const toast = useToast();
  const [employees, setEmployees] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [logins, setLogins] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<Set<string>>(new Set());
  const [nowMs] = useState(() => Date.now()); // instante de carga (estable durante el render)

  useEffect(() => {
    Promise.all([
      employeesService.getAll('active'),
      attendanceService.getAll(),
      notificationsService.getAll(),
      absencesService.getAll(),
      loginLogsService.getAll(),
    ])
      .then(([e, a, n, ab, lg]) => {
        setEmployees(e);
        setAttendance(a);
        setNotifications(n);
        setAbsences(ab);
        setLogins(lg);
      })
      .finally(() => setLoading(false));
  }, []);

  const dismiss = useCallback(async (id: string) => {
    setDismissing((s) => new Set(s).add(id));
    try {
      await notificationsService.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {
      toast.error('No se pudo descartar la notificación');
    } finally {
      setDismissing((s) => { const next = new Set(s); next.delete(id); return next; });
    }
  }, [toast]);

  const approveOvertime = useCallback(async (notif: Notification) => {
    if (!notif.attendance_id) return;
    setApproving((s) => new Set(s).add(notif.id));
    try {
      await attendanceService.approveOvertime(notif.attendance_id);
      toast.success('Horas extra aprobadas');
      setNotifications((prev) => prev.filter((n) => n.id !== notif.id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aprobar');
    } finally {
      setApproving((s) => { const next = new Set(s); next.delete(notif.id); return next; });
    }
  }, [toast]);

  if (loading) return <FullSpinner label="Cargando panel…" />;

  // ── Derivados ───────────────────────────────────────────────────────────
  const today = localDate(new Date(nowMs));
  const plus7 = localDate(new Date(nowMs + 7 * 86_400_000));
  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const withName = (a: Absence): AbsenceItem => ({ ...a, employee_name: nameById.get(a.employee_id) ?? 'Empleado' });

  const pending = attendance.filter((a) => a.status === 'pending_validation');
  const unread = notifications.filter((n) => !n.read);

  // Ausencias
  const todayAbsences = absences.filter((a) => a.start_date <= today && today <= a.end_date).map(withName);
  const upcomingAbsences = absences
    .filter((a) => a.start_date > today && a.start_date <= plus7)
    .map(withName)
    .sort((x, y) => (x.start_date < y.start_date ? -1 : 1));
  const absentIds = new Set(todayAbsences.map((a) => a.employee_id));

  // Presencia (deduplicado por empleado)
  const todaysAtt = attendance.filter((a) => localDate(new Date(a.check_in)) === today);
  const openByEmp = new Set(todaysAtt.filter((a) => a.check_out === null).map((a) => a.employee_id));
  const anyByEmp = new Set(todaysAtt.map((a) => a.employee_id));
  let working = 0;
  let finished = 0;
  const notClocked: User[] = [];
  for (const e of employees) {
    if (absentIds.has(e.id)) continue;
    if (openByEmp.has(e.id)) working++;
    else if (anyByEmp.has(e.id)) finished++;
    else notClocked.push(e);
  }

  // Últimos fichajes de hoy
  const events: PunchEvent[] = [];
  for (const a of todaysAtt) {
    events.push({ id: a.id, name: a.employee_name, action: 'in', time: a.check_in });
    if (a.check_out) events.push({ id: a.id, name: a.employee_name, action: 'out', time: a.check_out });
  }
  events.sort((x, y) => (x.time < y.time ? 1 : -1));

  // Anomalías de hoy
  const outsideGeofence = todaysAtt.filter((a) => a.check_in_outside === true).length;
  const manualToday = todaysAtt.filter((a) => a.source === 'manual').length;

  // Accesos recientes
  const recentLogins = [...logins].sort((x, y) => (x.login_time < y.login_time ? 1 : -1));

  // Departamentos
  const deptMap = new Map<string, number>();
  for (const e of employees) deptMap.set(e.department, (deptMap.get(e.department) ?? 0) + 1);
  const departments = [...deptMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const stats: StatTile[] = [
    { label: 'Empleados', value: employees.length, icon: <Users className="w-5 h-5" />, to: '/admin/empleados', tone: 'brand' },
    { label: 'Dentro ahora', value: working, icon: <LogIn className="w-5 h-5" />, to: '/admin/registros', tone: working ? 'green' : 'slate' },
    { label: 'Pend. de validar', value: pending.length, icon: <CheckSquare className="w-5 h-5" />, to: '/admin/validaciones', tone: pending.length ? 'amber' : 'slate' },
    { label: 'Notificaciones', value: unread.length, icon: <Bell className="w-5 h-5" />, to: '#notificaciones', tone: unread.length ? 'red' : 'slate' },
  ];

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title="Panel" subtitle="Resumen de la jornada" />

      <StatTiles stats={stats} />

      <PresenceWidget working={working} finished={finished} absent={absentIds.size} notClocked={notClocked} />

      <div className="grid lg:grid-cols-2 gap-4">
        <TodayPunchesWidget events={events} />
        <AbsencesWidget today={todayAbsences} upcoming={upcomingAbsences} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <FlagsWidget outsideGeofence={outsideGeofence} manualToday={manualToday} />
        <RecentLoginsWidget logins={recentLogins} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Fichajes pendientes de validar */}
        <WidgetCard
          title="Fichajes pendientes de validar"
          icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
          action={
            <Link to="/admin/validaciones" className="text-sm text-brand-600 flex items-center shrink-0">
              Ver todos <ChevronRight className="w-4 h-4" />
            </Link>
          }
        >
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400 py-3 text-center">Nada pendiente de validar</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {pending.slice(0, 5).map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-2 text-sm">
                  <span className="font-medium text-slate-700 truncate">{p.employee_name}</span>
                  <span className="text-slate-400 shrink-0">{formatDate(p.check_in)} · {formatTime(p.check_in)}</span>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>

        <DepartmentsWidget counts={departments} />
      </div>

      {/* Notificaciones (interactivo) */}
      <Card className="p-4" id="notificaciones">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-slate-800 flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-500" />
            Notificaciones
            {unread.length > 0 && (
              <span className="ml-1 text-xs bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">
                {unread.length}
              </span>
            )}
          </p>
        </div>

        {unread.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
            <Bell className="w-8 h-8 opacity-30" />
            <p className="text-sm">Todo al día, no hay notificaciones pendientes</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {unread.map((n) => {
              const meta = NOTIF_META[n.type] ?? NOTIF_META.info;
              const isDismissing = dismissing.has(n.id);
              const isApproving = approving.has(n.id);
              return (
                <li key={n.id} className="flex items-start gap-3 py-3">
                  <span className={`mt-0.5 shrink-0 w-7 h-7 rounded-lg grid place-items-center ${meta.color}`}>
                    {meta.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-400 mb-0.5">{meta.label}</p>
                    <p className="text-sm text-slate-700 leading-snug">
                      <span className="font-semibold">{n.employee_name}</span>{' — '}{n.message}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(n.timestamp)} · {formatTime(n.timestamp)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                    {n.type === 'overtime_request' && n.attendance_id && (
                      <button
                        onClick={() => approveOvertime(n)}
                        disabled={isApproving || isDismissing}
                        className="text-xs font-medium text-brand-600 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg transition disabled:opacity-50"
                      >
                        {isApproving ? '…' : 'Aprobar'}
                      </button>
                    )}
                    <button
                      onClick={() => dismiss(n.id)}
                      disabled={isDismissing || isApproving}
                      title="Descartar"
                      className="w-6 h-6 rounded-md grid place-items-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
                    >
                      {isDismissing ? <span className="text-[10px]">…</span> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};
