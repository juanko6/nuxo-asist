import React from 'react';
import type { User } from '@/types';
import { Card, cn } from '@/components/ui';

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');
}

interface EmployeeCardProps {
  employee: User;
  /** Estilo atenuado para empleados de baja */
  muted?: boolean;
  /** Botones de acción que se muestran en el pie de la tarjeta */
  actions?: React.ReactNode;
}

/**
 * Tarjeta rectangular reutilizable de empleado: avatar con iniciales,
 * nombre, cargo y departamento, y un pie con acciones.
 */
export const EmployeeCard: React.FC<EmployeeCardProps> = ({ employee, muted, actions }) => {
  return (
    <Card className="p-4 flex flex-col h-full">
      <div className="flex items-start gap-3 min-w-0">
        <div
          className={cn(
            'grid place-items-center w-11 h-11 rounded-full font-semibold text-sm shrink-0 select-none',
            muted ? 'bg-slate-100 text-slate-400' : 'bg-brand-100 text-brand-700'
          )}
        >
          {getInitials(employee.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-800 truncate" title={employee.name}>
            {employee.name}
          </p>
          <p className="text-sm text-slate-600 truncate" title={employee.position}>
            {employee.position}
          </p>
          <p className="text-xs text-slate-400 truncate" title={employee.department}>
            {employee.department}
          </p>
        </div>
      </div>

      {actions && (
        <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </Card>
  );
};
