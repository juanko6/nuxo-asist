import React, { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { authService } from '@/services/api/auth';
import { useAuthContext } from '@/context/auth';
import { Button, Card, Field, Input } from '@/components/ui';

/** Pantalla bloqueante del primer acceso: el empleado debe cambiar su contraseña. */
export const ChangePasswordRequired: React.FC = () => {
  const { refreshUser, logout, user } = useAuthContext();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setError('La nueva contraseña debe tener al menos 8 caracteres');
    if (next !== confirm) return setError('Las contraseñas no coinciden');
    setSaving(true);
    setError(null);
    try {
      await authService.changePassword(current, next);
      await refreshUser();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="grid place-items-center w-14 h-14 rounded-2xl bg-brand-600 text-white shadow-lg mb-3">
            <KeyRound className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Cambia tu contraseña</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Es tu primer acceso, {user?.name?.split(' ')[0]}. Crea una contraseña nueva para continuar.
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Field label="Contraseña actual (temporal)">
              <Input
                type="password"
                autoFocus
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
            </Field>
            <Field label="Repite la nueva contraseña">
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <Button type="submit" block size="lg" loading={saving}>
              Guardar y continuar
            </Button>
          </form>
        </Card>

        <button
          onClick={logout}
          className="mt-4 w-full flex items-center justify-center gap-1.5 text-sm text-slate-400 hover:text-slate-600"
        >
          <LogOut className="w-4 h-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
};
