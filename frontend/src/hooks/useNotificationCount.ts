import { useState, useEffect } from 'react';
import { attendanceService } from '@/services/api/attendance';

const POLL_INTERVAL = 60_000; // 1 minuto

export function useNotificationCount(enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const fetch = async () => {
      try {
        const { count } = await attendanceService.getPendingCount();
        if (!cancelled) setCount(count);
      } catch {
        // silencioso — no romper el layout si falla la petición
      }
    };

    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => { cancelled = true; clearInterval(id); };
  }, [enabled]);

  return count;
}
