import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';
import { setupService } from '@/services/api/setup';
import { useAuthContext } from '@/context/auth';
import { useSettings } from '@/context/settings';
import { Button, Input } from '@/components/ui';

interface Step {
  key: 'company_name' | 'admin_name' | 'admin_email' | 'admin_password';
  title: string;
  subtitle: string;
  type: string;
  placeholder: string;
  maxLength?: number;
  validate: (v: string) => true | string;
}

const STEPS: Step[] = [
  {
    key: 'company_name',
    title: '¿Cómo se llama tu empresa?',
    subtitle: 'Aparecerá en el acceso de tus empleados. Podrás cambiarlo después.',
    type: 'text',
    placeholder: 'Mi Empresa SL',
    maxLength: 60,
    validate: (v) => v.trim().length >= 2 || 'Escribe al menos 2 caracteres',
  },
  {
    key: 'admin_name',
    title: '¿Cómo te llamas?',
    subtitle: 'Serás el administrador del sistema.',
    type: 'text',
    placeholder: 'Tu nombre y apellidos',
    validate: (v) => v.trim().length >= 2 || 'Dinos tu nombre',
  },
  {
    key: 'admin_email',
    title: 'Tu email',
    subtitle: 'Lo usarás para iniciar sesión.',
    type: 'email',
    placeholder: 'tu@empresa.com',
    validate: (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) || 'Email no válido',
  },
  {
    key: 'admin_password',
    title: 'Crea una contraseña',
    subtitle: 'Mínimo 8 caracteres. Guárdala bien.',
    type: 'password',
    placeholder: '••••••••',
    validate: (v) => v.length >= 8 || 'Mínimo 8 caracteres',
  },
];

export const SetupWizard: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const { login } = useAuthContext();
  const { refresh } = useSettings();
  const navigate = useNavigate();

  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<Step['key'], string>>({
    company_name: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const step = STEPS[index]!;
  const isLast = index === STEPS.length - 1;
  const value = values[step.key];

  const finish = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await setupService.complete({
        company_name: values.company_name.trim(),
        admin_name: values.admin_name.trim(),
        admin_email: values.admin_email.trim(),
        admin_password: values.admin_password,
      });
      await refresh();
      await login({ email: values.admin_email.trim(), password: values.admin_password });
      onComplete();
      navigate('/admin', { replace: true });
    } catch (e) {
      setSubmitting(false);
      setError(e instanceof Error ? e.message : 'No se pudo completar la configuración');
    }
  };

  const next = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = step.validate(value);
    if (ok !== true) {
      setError(ok);
      return;
    }
    setError(null);
    if (isLast) await finish();
    else setIndex((i) => i + 1);
  };

  const back = () => {
    setError(null);
    setIndex((i) => Math.max(0, i - 1));
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gradient-to-br from-brand-50 via-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="grid place-items-center w-14 h-14 rounded-2xl bg-brand-600 text-white shadow-lg mb-3">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Configura tu sistema</h1>
          <p className="text-sm text-slate-500">Solo tardarás un minuto</p>
        </div>

        {/* Progreso */}
        <div className="flex justify-center gap-1.5 mb-6">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={
                'h-1.5 rounded-full transition-all ' +
                (i === index ? 'w-8 bg-brand-600' : i < index ? 'w-4 bg-brand-300' : 'w-4 bg-slate-200')
              }
            />
          ))}
        </div>

        {/* Paso actual (se re-monta para reproducir la animación) */}
        <form key={step.key} onSubmit={next} className="animate-slide-up">
          <div className="bg-white rounded-2xl shadow-card p-6">
            <div className="flex items-center gap-2 text-brand-600 mb-1">
              <Building2 className="w-4 h-4" />
              <span className="text-xs font-semibold uppercase tracking-wide">
                Paso {index + 1} de {STEPS.length}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-900">{step.title}</h2>
            <p className="text-sm text-slate-500 mt-1 mb-4">{step.subtitle}</p>

            <Input
              autoFocus
              type={step.type}
              placeholder={step.placeholder}
              maxLength={step.maxLength}
              value={value}
              onChange={(e) => setValues((v) => ({ ...v, [step.key]: e.target.value }))}
            />

            {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

            <div className="flex gap-2 mt-5">
              {index > 0 && (
                <Button type="button" variant="secondary" onClick={back} disabled={submitting}>
                  <ArrowLeft className="w-4 h-4" /> Atrás
                </Button>
              )}
              <Button type="submit" block loading={submitting}>
                {isLast ? (
                  <>
                    <Check className="w-4 h-4" /> Crear y entrar
                  </>
                ) : (
                  <>
                    Siguiente <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>

        <p className="text-center text-xs text-slate-400 mt-4">
          Pulsa <kbd className="px-1 py-0.5 rounded bg-slate-200 text-slate-600">Enter</kbd> para continuar
        </p>
      </div>
    </div>
  );
};
