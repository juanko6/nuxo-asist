import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CheckSquare, CalendarOff, AlertTriangle, ChevronRight } from 'lucide-react';
import { employeesService } from '@/services/api/employees';
import { attendanceService } from '@/services/api/attendance';
import { notificationsService } from '@/services/api/notifications';
import type { AttendanceRecord, Notification, User } from '@/types';
import { Card, FullSpinner, PageHeader, Badge } from '@/components/ui';
import { formatDate, formatTime } from '@/lib/format';

export const AdminDashboard: React.FC = () => {
  const [employees, setEmployees] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      employeesService.getAll(),
      attendanceService.getAll(),
      notificationsService.getAll(),
    ])
      .then(([e, a, n]) => {
        setEmployees(e);
        setAttendance(a);
        setNotifications(n);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <FullSpinner label="Cargando panel…" />;

  const pending = attendance.filter((a) => a.status === 'pending_validation');
  const absenceAlerts = notifications.filter((n) => n.type === 'absence');

  const stats = [
    { label: 'Empleados', value: employees.length, icon: <Users className="w-5 h-5" />, to: '/admin/empleados', tone: 'brand' as const },
    { label: 'Pend. de validar', value: pending.length, icon: <CheckSquare className="w-5 h-5" />, to: '/admin/validaciones', tone: pending.length ? 'amber' as const : 'slate' as const },
    { label: 'Avisos de ausencia', value: absenceAlerts.length, icon: <CalendarOff className="w-5 h-5" />, to: '/admin/ausencias', tone: absenceAlerts.length ? 'red' as const : 'slate' as const },
  ];

  return (
    <div className="animate-fade-in">
      <PageHeader title="Panel" subtitle="Resumen de la jornada" />

      <div className="grid grid-cols-3 gap-3 mb-5">
        {stats.map((s) => (
          <Link key={s.label} to={s.to}>
            <Card className="p-4 hover:shadow-card-hover transition">
              <div className="flex items-center justify-between mb-2">
                <Badge tone={s.tone}>{s.icon}</Badge>
              </div>
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {pending.length > 0 && (
        <Card className="p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Fichajes pendientes de validar
            </p>
            <Link to="/admin/validaciones" className="text-sm text-brand-600 flex items-center">
              Ver todos <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {pending.slice(0, 4).map((p) => (
              <li key={p.id} className="flex justify-between py-2 text-sm">
                <span className="font-medium text-slate-700">{p.employee_name}</span>
                <span className="text-slate-500">{formatDate(p.check_in)} · {formatTime(p.check_in)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {absenceAlerts.length > 0 && (
        <Card className="p-4">
          <p className="font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <CalendarOff className="w-4 h-4 text-rose-500" /> Ausencias por justificar
          </p>
          <ul className="divide-y divide-slate-100">
            {absenceAlerts.slice(0, 5).map((n) => (
              <li key={n.id} className="py-2 text-sm">
                <span className="font-medium text-slate-700">{n.employee_name}</span>
                <span className="text-slate-500"> — {n.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};
