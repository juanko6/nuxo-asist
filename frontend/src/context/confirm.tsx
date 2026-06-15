/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Button } from '@/components/ui';

interface ConfirmOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'success' | 'warning';
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Confirmación de acciones (HU-06). El botón de confirmar se deshabilita tras el
 * primer clic (anti doble-tap) y el modal se cierra al resolver, evitando
 * registros duplicados. La hora de "intención" la captura quien llama, antes de
 * abrir el modal, para no penalizar al usuario si tarda en confirmar.
 */
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setSubmitting(false);
    setOpts(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (value: boolean) => {
    if (value) setSubmitting(true);
    resolver.current?.(value);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={opts !== null}
        onClose={() => settle(false)}
        title={opts?.title}
        footer={
          <>
            <Button variant="secondary" block onClick={() => settle(false)}>
              {opts?.cancelLabel ?? 'Cancelar'}
            </Button>
            <Button
              variant={opts?.tone ?? 'primary'}
              block
              disabled={submitting}
              onClick={() => settle(true)}
            >
              {opts?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-slate-600">{opts?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = (): ConfirmFn => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de ConfirmProvider');
  return ctx;
};
