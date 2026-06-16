import type { AttendanceStatus, AttendanceSource, AbsenceType } from '@/types';

export const formatTime = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—';

export const formatDateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

export const formatDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/** Minutos -> "8h 30m" / "45m". */
export const formatDuration = (minutes: number | null): string => {
  if (minutes === null || minutes === undefined) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  confirmed: 'Confirmado',
  pending_validation: 'Pendiente de validar',
  rejected: 'Rechazado',
};

export const STATUS_TONES: Record<AttendanceStatus, 'green' | 'amber' | 'red'> = {
  confirmed: 'green',
  pending_validation: 'amber',
  rejected: 'red',
};

export const SOURCE_LABELS: Record<AttendanceSource, string> = {
  realtime: 'En tiempo real',
  manual: 'Manual',
  system: 'Cierre por sistema',
};

export const ABSENCE_LABELS: Record<AbsenceType, string> = {
  vacation: 'Vacaciones',
  sick_leave: 'Baja médica',
  leave: 'Permiso',
  other: 'Otro',
};

export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const weekdayLabel = (isoWeekday: number): string => WEEKDAYS[isoWeekday - 1] ?? '';

/** 'HH:MM:SS' o 'HH:MM' -> 'HH:MM'. */
export const shortTime = (t: string): string => t.slice(0, 5);
