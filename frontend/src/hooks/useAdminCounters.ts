import { useState, useEffect } from 'react';
import { attendanceService } from '@/services/api/attendance';
import { notificationsService } from '@/services/api/notifications';
import { subscribeCounters } from '@/lib/counters';

const POLL_INTERVAL = 60_000; // 1 minuto

export interface AdminCounters {
  /** Fichajes pendientes de validar */
  pending: number;
  /** Notificaciones sin leer */
  notifications: number;
}

export function useAdminCounters(enabled: boolean): AdminCounters {
  const [counters, setCounters] = useState<AdminCounters>({ pending: 0, notifications: 0 });

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const fetchCounts = async () => {
      try {
        const [{ count }, notifs] = await Promise.all([
          attendanceService.getPendingCount(),
          notificationsService.getAll(),
        ]);
        if (!cancelled) {
          setCounters({ pending: count, notifications: notifs.filter((n) => !n.read).length });
        }
      } catch {
        // silencioso — no romper el layout si falla la petición
      }
    };

    fetchCounts();
    const id = setInterval(fetchCounts, POLL_INTERVAL);
    const unsubscribe = subscribeCounters(fetchCounts); // refresco inmediato al mutar datos
    return () => { cancelled = true; clearInterval(id); unsubscribe(); };
  }, [enabled]);

  return counters;
}
