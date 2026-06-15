import React, { useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
import { loginLogsService } from '@/services/api/loginLogs';
import type { LoginLog } from '@/types';
import { Card, FullSpinner, EmptyState, PageHeader } from '@/components/ui';
import { formatDateTime } from '@/lib/format';

export const AdminLogs: React.FC = () => {
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loginLogsService
      .getAll()
      .then(setLogs)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <FullSpinner label="Cargando…" />;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Accesos" subtitle={`${logs.length} inicios de sesión`} />
      {logs.length === 0 ? (
        <EmptyState icon={<LogIn className="w-10 h-10" />} title="Sin accesos registrados" />
      ) : (
        <Card className="divide-y divide-slate-100">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-4 py-3">
              <span className="font-medium text-slate-700">{l.employee_name}</span>
              <span className="text-sm text-slate-500">{formatDateTime(l.login_time)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};
