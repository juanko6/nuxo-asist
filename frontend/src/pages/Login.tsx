import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Fingerprint } from 'lucide-react';
import { useAuthContext } from '@/context/auth';
import { Button, Card, Field, Input } from '@/components/ui';

export const LoginPage: React.FC = () => {
  const { login } = useAuthContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const ok = await login({ email, password });
    setLoading(false);
    if (ok) navigate('/', { replace: true });
    else setError('Email o contraseña incorrectos');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="grid place-items-center w-14 h-14 rounded-2xl bg-brand-600 text-white shadow-lg mb-3">
            <Fingerprint className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Control de Asistencia</h1>
          <p className="text-sm text-slate-500 mt-1">Inicia sesión para fichar</p>
        </div>

        <Card className="p-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                required
                placeholder="tu@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Contraseña" htmlFor="password">
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <Button type="submit" block size="lg" loading={loading}>
              Entrar
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
};
