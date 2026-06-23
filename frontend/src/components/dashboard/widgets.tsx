import React from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, LogIn, LogOut, Clock, CalendarOff, MapPinOff, FileEdit,
  History, Building2, ChevronRight,
} from 'lucide-react';
import type { User, Absence, LoginLog } from '@/types';
import { Card, Badge, cn } from '@/components/ui';
import { ABSENCE_LABELS, formatTime, formatDate } from '@/lib/format';

/* ────────────────────────── Contenedor común ────────────────────────── */

export const WidgetCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, icon, action, className, children }) => (
  <Card className={cn('p-4 flex flex-col', className)}>
    <div className="flex items-center justify-between gap-2 mb-3">
      <p className="font-semibold text-slate-800 flex items-center gap-2 min-w-0">
        {icon}
        <span className="truncate">{title}</span>
      </p>
      {action}
    </div>
    {children}
  </Card>
);

const EmptyRow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-sm text-slate-400 py-3 text-center">{children}</p>
);

/* ────────────────────────────── KPIs ────────────────────────────────── */

export interface StatTile {
  label: string;
  value: number;
  icon: React.ReactNode;
  to: string;
  tone: 'brand' | 'amber' | 'red' | 'slate' | 'green' | 'blue';
}

export const StatTiles: React.FC<{ stats: StatTile[] }> = ({ stats }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
    {stats.map((s) => (
      <Link key={s.label} to={s.to} className="min-w-0">
        <Card className="p-4 hover:shadow-card-hover transition h-full">
          <div className="mb-2">
            <Badge tone={s.tone}>{s.icon}</Badge>
          </div>
          <p className="text-2xl font-bold text-slate-900">{s.value}</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-tight break-words">{s.label}</p>
        </Card>
      </Link>
    ))}
  </div>
);

/* ─────────────────────────── Presencia hoy ──────────────────────────── */

const PresenceTile: React.FC<{ label: string; value: number; tone: string }> = ({
  label, value, tone,
}) => (
  <div className="rounded-xl bg-slate-50 p-3">
    <p className={cn('text-xl font-bold', tone)}>{value}</p>
    <p className="text-xs text-slate-500 leading-tight">{label}</p>
  </div>
);

export const PresenceWidget: React.FC<{
  working: number;
  finished: number;
  absent: number;
  notClocked: User[];
}> = ({ working, finished, absent, notClocked }) => {
  const missing = notClocked.length;
  const total = working + finished + absent + missing;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <WidgetCard title="Presencia hoy" icon={<Activity className="w-4 h-4 text-brand-500" />}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-3">
        <PresenceTile label="Dentro" value={working} tone="text-emerald-600" />
        <PresenceTile label="Finalizaron" value={finished} tone="text-slate-700" />
        <PresenceTile label="Sin fichar" value={missing} tone="text-amber-600" />
        <PresenceTile label="Ausentes" value={absent} tone="text-sky-600" />
      </div>

      {total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mb-3">
          <div className="bg-emerald-500" style={{ width: `${pct(working)}%` }} />
          <div className="bg-slate-400" style={{ width: `${pct(finished)}%` }} />
          <div className="bg-amber-400" style={{ width: `${pct(missing)}%` }} />
          <div className="bg-sky-400" style={{ width: `${pct(absent)}%` }} />
        </div>
      )}

      {missing > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-slate-400 mr-1">Sin fichar:</span>
          {notClocked.slice(0, 6).map((e) => (
            <span key={e.id} className="text-xs bg-amber-50 text-amber-700 rounded-full px-2 py-0.5">
              {e.name}
            </span>
          ))}
          {missing > 6 && <span className="text-xs text-slate-400">+{missing - 6}</span>}
        </div>
      )}
    </WidgetCard>
  );
};

/* ───────────────────────── Últimos fichajes ─────────────────────────── */

export interface PunchEvent {
  id: string;
  name: string;
  action: 'in' | 'out';
  time: string;
}

export const TodayPunchesWidget: React.FC<{ events: PunchEvent[] }> = ({ events }) => (
  <WidgetCard title="Últimos fichajes de hoy" icon={<Clock className="w-4 h-4 text-brand-500" />}>
    {events.length === 0 ? (
      <EmptyRow>Aún no hay fichajes hoy</EmptyRow>
    ) : (
      <ul className="divide-y divide-slate-100">
        {events.slice(0, 6).map((e) => (
          <li key={`${e.id}-${e.action}`} className="flex items-center gap-3 py-2">
            <span
              className={cn(
                'shrink-0 w-7 h-7 rounded-lg grid place-items-center',
                e.action === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
              )}
            >
              {e.action === 'in' ? <LogIn className="w-4 h-4" /> : <LogOut className="w-4 h-4" />}
            </span>
            <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{e.name}</span>
            <span className="text-xs text-slate-400 shrink-0">
              {e.action === 'in' ? 'Entró' : 'Salió'} · {formatTime(e.time)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </WidgetCard>
);

/* ──────────────────────── Ausencias hoy/próximas ────────────────────── */

export interface AbsenceItem extends Absence {
  employee_name: string;
}

const absenceTone = (t: Absence['type']) =>
  t === 'vacation' ? 'blue' : t === 'sick_leave' ? 'red' : t === 'leave' ? 'amber' : 'slate';

export const AbsencesWidget: React.FC<{ today: AbsenceItem[]; upcoming: AbsenceItem[] }> = ({
  today, upcoming,
}) => (
  <WidgetCard
    title="Ausencias"
    icon={<CalendarOff className="w-4 h-4 text-sky-500" />}
    action={
      <Link to="/admin/ausencias" className="text-sm text-brand-600 flex items-center shrink-0">
        Ver todas <ChevronRight className="w-4 h-4" />
      </Link>
    }
  >
    {today.length === 0 && upcoming.length === 0 ? (
      <EmptyRow>Nadie ausente hoy ni en los próximos días</EmptyRow>
    ) : (
      <div className="space-y-3">
        {today.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Hoy</p>
            <ul className="space-y-1.5">
              {today.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700 truncate">{a.employee_name}</span>
                  <Badge tone={absenceTone(a.type)}>{ABSENCE_LABELS[a.type]}</Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
        {upcoming.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase mb-1.5">Próximos 7 días</p>
            <ul className="space-y-1.5">
              {upcoming.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-700 truncate">{a.employee_name}</span>
                  <span className="text-xs text-slate-400 shrink-0">
                    {ABSENCE_LABELS[a.type]} · {formatDate(a.start_date)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )}
  </WidgetCard>
);

/* ──────────────────────────── Anomalías ─────────────────────────────── */

export const FlagsWidget: React.FC<{ outsideGeofence: number; manualToday: number }> = ({
  outsideGeofence, manualToday,
}) => (
  <WidgetCard title="A revisar hoy" icon={<MapPinOff className="w-4 h-4 text-rose-500" />}>
    <div className="grid grid-cols-2 gap-2.5">
      <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-3">
        <MapPinOff className="w-5 h-5 text-rose-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-xl font-bold text-slate-800">{outsideGeofence}</p>
          <p className="text-xs text-slate-500 leading-tight">Fuera de geocerca</p>
        </div>
      </div>
      <div className="rounded-xl bg-slate-50 p-3 flex items-center gap-3">
        <FileEdit className="w-5 h-5 text-amber-500 shrink-0" />
        <div className="min-w-0">
          <p className="text-xl font-bold text-slate-800">{manualToday}</p>
          <p className="text-xs text-slate-500 leading-tight">Fichajes manuales</p>
        </div>
      </div>
    </div>
  </WidgetCard>
);

/* ───────────────────────── Últimos accesos ──────────────────────────── */

export const RecentLoginsWidget: React.FC<{ logins: LoginLog[] }> = ({ logins }) => (
  <WidgetCard
    title="Últimos accesos"
    icon={<History className="w-4 h-4 text-slate-400" />}
    action={
      <Link to="/admin/logs" className="text-sm text-brand-600 flex items-center shrink-0">
        Ver todos <ChevronRight className="w-4 h-4" />
      </Link>
    }
  >
    {logins.length === 0 ? (
      <EmptyRow>Sin accesos registrados</EmptyRow>
    ) : (
      <ul className="divide-y divide-slate-100">
        {logins.slice(0, 5).map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="text-slate-700 truncate">{l.employee_name}</span>
            <span className="text-xs text-slate-400 shrink-0">
              {formatDate(l.login_time)} · {formatTime(l.login_time)}
            </span>
          </li>
        ))}
      </ul>
    )}
  </WidgetCard>
);

/* ─────────────────────── Plantilla por departamento ─────────────────── */

export const DepartmentsWidget: React.FC<{ counts: { name: string; count: number }[] }> = ({
  counts,
}) => {
  const max = counts.reduce((m, c) => Math.max(m, c.count), 0);
  return (
    <WidgetCard title="Plantilla por departamento" icon={<Building2 className="w-4 h-4 text-brand-500" />}>
      {counts.length === 0 ? (
        <EmptyRow>Sin departamentos</EmptyRow>
      ) : (
        <ul className="space-y-2">
          {counts.map((c) => (
            <li key={c.name} className="text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-700 truncate">{c.name}</span>
                <span className="text-slate-400 shrink-0">{c.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-400"
                  style={{ width: `${max > 0 ? (c.count / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
};
