import React from 'react';
import { Clock, CalendarOff, Info, ThumbsUp } from 'lucide-react';
import type { Notification } from '@/types';

/** Etiqueta, icono y color por tipo de notificación (compartido). */
export const NOTIF_META: Record<
  Notification['type'],
  { label: string; icon: React.ReactNode; color: string }
> = {
  overtime_request: { label: 'Solicitud de horas extra', icon: <Clock className="w-4 h-4" />, color: 'text-amber-600 bg-amber-50' },
  absence: { label: 'Ausencia sin justificar', icon: <CalendarOff className="w-4 h-4" />, color: 'text-rose-600 bg-rose-50' },
  info: { label: 'Aviso del sistema', icon: <Info className="w-4 h-4" />, color: 'text-slate-500 bg-slate-100' },
  approval: { label: 'Aprobación', icon: <ThumbsUp className="w-4 h-4" />, color: 'text-brand-600 bg-brand-50' },
};
