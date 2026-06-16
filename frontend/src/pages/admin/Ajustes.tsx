import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Save, MapPin, Crosshair, Monitor } from 'lucide-react';
import { settingsService } from '@/services/api/setup';
import { useSettings } from '@/context/settings';
import { useToast } from '@/context/toast';
import { Card, Button, Field, Input, Select, PageHeader, FullSpinner } from '@/components/ui';
import type { GeolocationMode } from '@/types';

interface Form {
  company_name: string;
  geolocation_mode: GeolocationMode;
  geofence_lat: string;
  geofence_lng: string;
  geofence_radius_m: string;
}

export const AdminAjustes: React.FC = () => {
  const { refresh } = useSettings();
  const toast = useToast();
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsService
      .get()
      .then((s) =>
        setForm({
          company_name: s.company_name ?? '',
          geolocation_mode: s.geolocation_mode ?? 'off',
          geofence_lat: s.geofence_lat?.toString() ?? '',
          geofence_lng: s.geofence_lng?.toString() ?? '',
          geofence_radius_m: s.geofence_radius_m?.toString() ?? '',
        })
      )
      .catch(() => toast.error('No se pudieron cargar los ajustes'));
  }, [toast]);

  if (!form) return <FullSpinner label="Cargando ajustes…" />;

  const set = (patch: Partial<Form>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error('Tu navegador no soporta geolocalización');
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        set({
          geofence_lat: pos.coords.latitude.toFixed(6),
          geofence_lng: pos.coords.longitude.toFixed(6),
        }),
      () => toast.error('No se pudo obtener tu ubicación')
    );
  };

  const save = async () => {
    if (form.company_name.trim().length < 2) return;
    setSaving(true);
    try {
      const num = (s: string) => (s.trim() === '' ? null : Number(s));
      await settingsService.update({
        company_name: form.company_name.trim(),
        geolocation_mode: form.geolocation_mode,
        geofence_lat: num(form.geofence_lat),
        geofence_lng: num(form.geofence_lng),
        geofence_radius_m: form.geofence_radius_m.trim() === '' ? null : parseInt(form.geofence_radius_m, 10),
      });
      await refresh();
      toast.success('Ajustes guardados');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const geoOn = form.geolocation_mode !== 'off';

  return (
    <div className="animate-fade-in space-y-4">
      <PageHeader title="Ajustes" subtitle="Configuración de la empresa" />

      <Card className="p-5 max-w-md">
        <Field label="Nombre de la empresa" hint="Se muestra en el acceso y en la cabecera.">
          <Input
            value={form.company_name}
            maxLength={60}
            onChange={(e) => set({ company_name: e.target.value })}
            placeholder="Mi Empresa SL"
          />
        </Field>
      </Card>

      <Card className="p-5 max-w-md space-y-3">
        <p className="font-semibold text-slate-800 flex items-center gap-2">
          <MapPin className="w-4 h-4 text-brand-600" /> Geolocalización (RGPD)
        </p>
        <Field label="Registro de ubicación al fichar">
          <Select
            value={form.geolocation_mode}
            onChange={(e) => set({ geolocation_mode: e.target.value as GeolocationMode })}
          >
            <option value="off">Desactivada</option>
            <option value="optional">Opcional (se pide, pero no obliga)</option>
            <option value="required">Obligatoria (sin ubicación no se ficha)</option>
          </Select>
        </Field>

        {geoOn && (
          <>
            <p className="text-xs text-slate-500">
              Geocerca opcional: define el centro del lugar de trabajo y un radio. Los fichajes
              fuera de la zona se marcan en los registros.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud">
                <Input value={form.geofence_lat} onChange={(e) => set({ geofence_lat: e.target.value })} placeholder="40.4168" />
              </Field>
              <Field label="Longitud">
                <Input value={form.geofence_lng} onChange={(e) => set({ geofence_lng: e.target.value })} placeholder="-3.7038" />
              </Field>
            </div>
            <Field label="Radio (metros)">
              <Input value={form.geofence_radius_m} onChange={(e) => set({ geofence_radius_m: e.target.value })} placeholder="100" />
            </Field>
            <Button variant="secondary" size="sm" onClick={useMyLocation}>
              <Crosshair className="w-4 h-4" /> Usar mi ubicación actual
            </Button>
          </>
        )}
      </Card>

      <Card className="p-5 max-w-md space-y-2">
        <p className="font-semibold text-slate-800 flex items-center gap-2">
          <Monitor className="w-4 h-4 text-brand-600" /> Modo kiosco
        </p>
        <p className="text-sm text-slate-500">
          En el dispositivo compartido (p. ej. una tablet en la entrada), abre el modo kiosco y
          actívalo desde esta misma sesión. Los empleados ficharán con su PIN o QR (configúralos en
          cada empleado).
        </p>
        <Link
          to="/kiosk"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline"
        >
          <Monitor className="w-4 h-4" /> Abrir modo kiosco
        </Link>
      </Card>

      <Button loading={saving} disabled={form.company_name.trim().length < 2} onClick={save}>
        <Save className="w-4 h-4" /> Guardar
      </Button>
    </div>
  );
};
