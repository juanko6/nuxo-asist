import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, LogIn, CheckSquare, Bell, AlertTriangle, ChevronRight } from 'lucide-react';
import { employeesService } from '@/services/api/employees';
import { attendanceService } from '@/services/api/attendance';
import { notificationsService } from '@/services/api/notifications';
import { absencesService } from '@/services/api/absences';
import { loginLogsService } from '@/services/api/loginLogs';
import type { AttendanceRecord, Notification, User, Absence, LoginLog } from '@/types';
import { FullSpinner, PageHeader } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/format';
import {
  StatTiles, PresenceWidget, TodayPunchesWidget, AbsencesWidget, FlagsWidget,
  RecentLoginsWidget, DepartmentsWidget, NotificationsWidget, WidgetCard,
  type StatTile, type PunchEvent, type AbsenceItem,
} from '@/components/dashboard/widgets';

// ── Helpers de fecha (zona local del navegador) ──────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const AdminDashboard: React.FC = () => {
  const [employees, setEmployees] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [logins, setLogins] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
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
    { label: 'Notificaciones', value: unread.length, icon: <Bell className="w-5 h-5" />, to: '/admin/notificaciones', tone: unread.length ? 'red' : 'slate' },
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

      <NotificationsWidget notifications={unread} />
    </div>
  );
};
