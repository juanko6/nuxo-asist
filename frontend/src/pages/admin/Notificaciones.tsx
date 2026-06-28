import React, { useCallback, useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { notificationsService } from '@/services/api/notifications';
import { attendanceService } from '@/services/api/attendance';
import type { Notification } from '@/types';
import { FullSpinner, EmptyState, PageHeader, cn } from '@/components/ui';
import { useToast } from '@/context/toast';
import { notifyCountersChanged } from '@/lib/counters';
import { formatDate, formatTime } from '@/lib/format';
import { NOTIF_META } from '@/components/dashboard/notifMeta';

export const AdminNotificaciones: React.FC = () => {
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<Set<string>>(new Set());
  const [approving, setApproving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setNotifications(await notificationsService.getAll());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const dismiss = useCallback(async (id: string) => {
    setDismissing((s) => new Set(s).add(id));
    try {
      await notificationsService.delete(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      notifyCountersChanged();
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
      notifyCountersChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo aprobar');
    } finally {
      setApproving((s) => { const next = new Set(s); next.delete(notif.id); return next; });
    }
  }, [toast]);

  if (loading) return <FullSpinner label="Cargando…" />;

  const unread = notifications.filter((n) => !n.read);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Notificaciones" subtitle="Avisos del sistema y solicitudes de empleados" />

      {unread.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-10 h-10" />}
          title="Todo al día"
          hint="Las solicitudes y avisos aparecerán aquí."
        />
      ) : (
        <ul className="space-y-2.5">
          {unread.map((n) => {
            const meta = NOTIF_META[n.type] ?? NOTIF_META.info;
            const isDismissing = dismissing.has(n.id);
            const isApproving = approving.has(n.id);
            return (
              <li key={n.id} className="bg-white rounded-2xl shadow-card p-4 flex items-start gap-3">
                <span className={cn('mt-0.5 shrink-0 w-8 h-8 rounded-lg grid place-items-center', meta.color)}>
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
                    className="w-7 h-7 rounded-md grid place-items-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition disabled:opacity-50"
                  >
                    {isDismissing ? <span className="text-[10px]">…</span> : <X className="w-4 h-4" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
