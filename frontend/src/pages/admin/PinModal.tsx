import React, { useState } from 'react';
import QRCode from 'qrcode';
import { Printer, Trash2 } from 'lucide-react';
import { employeesService } from '@/services/api/employees';
import type { User } from '@/types';
import { Modal, Button, Field, Input } from '@/components/ui';

export const PinModal: React.FC<{
  employee: User;
  onClose: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}> = ({ employee, onClose, onSaved, onError }) => {
  const [pin, setPin] = useState('');
  const [qr, setQr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const valid = /^\d{4,8}$/.test(pin);

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await employeesService.setPin(employee.id, pin);
      setQr(await QRCode.toDataURL(pin, { width: 240, margin: 1 }));
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo guardar el PIN');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await employeesService.setPin(employee.id, null);
      onSaved();
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'No se pudo quitar el PIN');
    }
  };

  return (
    <Modal open onClose={onClose} title={`PIN de kiosco · ${employee.name}`}>
      {!qr ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Asigna un PIN numérico (4-8 dígitos) para que {employee.name.split(' ')[0]} fiche en el
            kiosco. Al guardarlo se genera un QR para imprimir.
            {employee.has_pin && ' Ya tiene un PIN; al guardar uno nuevo lo reemplazas.'}
          </p>
          <Field label="PIN">
            <Input
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Ej. 4071"
            />
          </Field>
          <div className="flex gap-2">
            {employee.has_pin && (
              <Button variant="secondary" onClick={remove}>
                <Trash2 className="w-4 h-4" /> Quitar PIN
              </Button>
            )}
            <Button block loading={saving} disabled={!valid} onClick={save}>
              Guardar y generar QR
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-sm text-slate-500">
            Entrega este QR (o el PIN) a {employee.name.split(' ')[0]}. Podrá escanearlo o teclearlo
            en el kiosco.
          </p>
          <img src={qr} alt="QR del PIN" className="mx-auto rounded-xl border border-slate-200" />
          <p className="font-mono text-lg text-slate-800">PIN: {pin}</p>
          <div className="flex gap-2">
            <Button variant="secondary" block onClick={() => window.print()}>
              <Printer className="w-4 h-4" /> Imprimir
            </Button>
            <Button block onClick={onClose}>Cerrar</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};
