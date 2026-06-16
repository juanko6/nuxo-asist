import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { settingsService } from '@/services/api/setup';
import { useSettings } from '@/context/settings';
import { useToast } from '@/context/toast';
import { Card, Button, Field, Input, PageHeader } from '@/components/ui';

export const AdminAjustes: React.FC = () => {
  const { companyName, refresh } = useSettings();
  const toast = useToast();
  // draft = null mientras no se edita → refleja el valor actual del contexto
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const value = draft ?? companyName ?? '';

  const save = async () => {
    const name = value.trim();
    if (name.length < 2) return;
    setSaving(true);
    try {
      await settingsService.update(name);
      await refresh();
      setDraft(null);
      toast.success('Ajustes guardados');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <PageHeader title="Ajustes" subtitle="Configuración de la empresa" />
      <Card className="p-5 max-w-md">
        <Field label="Nombre de la empresa" hint="Se muestra en el acceso y en la cabecera.">
          <Input
            value={value}
            maxLength={60}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Mi Empresa SL"
          />
        </Field>
        <Button className="mt-4" loading={saving} disabled={value.trim().length < 2} onClick={save}>
          <Save className="w-4 h-4" /> Guardar
        </Button>
      </Card>
    </div>
  );
};
