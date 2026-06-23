import React, { useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { supportService } from '@/services/api/support';
import { useToast } from '@/context/toast';
import { Modal, Button, Field, Input } from '@/components/ui';

interface SupportButtonProps {
  /** true = expandido (icono + label), false = solo icono centrado, undefined = botón icono independiente */
  expanded?: boolean;
}

export const SupportButton: React.FC<SupportButtonProps> = ({ expanded }) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const valid = subject.trim().length >= 3 && message.trim().length >= 10;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      const res = await supportService.create({ subject: subject.trim(), message: message.trim() });
      toast.success(
        res.email_sent ? 'Ticket enviado a soporte' : 'Ticket registrado; soporte lo revisará'
      );
      setSubject('');
      setMessage('');
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo enviar el ticket');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {expanded === true ? (
        /* sidebar expandido: icono + label, ancho completo */
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all w-full"
        >
          <LifeBuoy className="w-4 h-4 shrink-0" />
          Soporte
        </button>
      ) : expanded === false ? (
        /* sidebar colapsado: solo icono centrado */
        <button
          onClick={() => setOpen(true)}
          title="Soporte"
          className="flex items-center justify-center w-full py-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-all"
        >
          <LifeBuoy className="w-4 h-4" />
        </button>
      ) : (
        /* uso independiente (header, etc.) */
        <button
          onClick={() => setOpen(true)}
          title="Soporte"
          className="grid place-items-center w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100"
        >
          <LifeBuoy className="w-4 h-4" />
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Soporte nuxoasist"
        footer={
          <>
            <Button variant="secondary" block onClick={() => setOpen(false)}>Cancelar</Button>
            <Button block loading={saving} disabled={!valid} onClick={submit}>Enviar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            ¿Necesitas ayuda? Cuéntanos y nuestro equipo te contactará por email.
          </p>
          <Field label="Asunto">
            <Input
              value={subject}
              maxLength={150}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Resumen breve del problema"
            />
          </Field>
          <Field label="Mensaje">
            <textarea
              value={message}
              maxLength={4000}
              rows={5}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe el problema o la consulta con el mayor detalle posible"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-transparent resize-none"
            />
          </Field>
        </div>
      </Modal>
    </>
  );
};
