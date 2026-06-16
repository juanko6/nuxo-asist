import React, { useState } from 'react';
import { Download, FileSpreadsheet, CheckCircle2, AlertTriangle } from 'lucide-react';
import { employeesService } from '@/services/api/employees';
import type { BulkEmployeeRow, BulkImportResult } from '@/types';
import { Modal, Button } from '@/components/ui';
import { parseEmployeesCsv, CSV_TEMPLATE, downloadText } from '@/lib/csv';

export const ImportEmpleadosModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}> = ({ open, onClose, onImported }) => {
  const [rows, setRows] = useState<BulkEmployeeRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setRows([]);
    setFileName('');
    setResult(null);
    setError(null);
    onClose();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setError(null);
    const parsed = parseEmployeesCsv(await file.text());
    if (parsed.length === 0) {
      setError('No se encontraron filas. Revisa la cabecera (nombre, email, departamento, puesto).');
      setRows([]);
      return;
    }
    setRows(parsed);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await employeesService.bulkCreate(rows);
      setResult(res);
      if (res.created.length > 0) onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar');
    } finally {
      setSaving(false);
    }
  };

  const downloadCredentials = () => {
    if (!result) return;
    const csv =
      'email,password\n' + result.created.map((c) => `${c.email},${c.password}`).join('\n') + '\n';
    downloadText('credenciales.csv', csv);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Importar empleados (CSV)"
      footer={
        result ? (
          <Button block onClick={close}>Cerrar</Button>
        ) : (
          <>
            <Button variant="secondary" block onClick={close}>Cancelar</Button>
            <Button block loading={saving} disabled={rows.length === 0} onClick={submit}>
              Crear {rows.length || ''}
            </Button>
          </>
        )
      }
    >
      {!result ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            Sube un CSV con columnas <b>nombre, email, departamento, puesto</b> y, opcionalmente,{' '}
            <b>password</b>. Si dejas la contraseña vacía, se genera una temporal.
          </p>
          <button
            onClick={() => downloadText('plantilla-empleados.csv', CSV_TEMPLATE)}
            className="text-sm text-brand-600 inline-flex items-center gap-1.5 hover:underline"
          >
            <Download className="w-4 h-4" /> Descargar plantilla
          </button>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-6 cursor-pointer hover:border-brand-300">
            <FileSpreadsheet className="w-7 h-7 text-slate-300" />
            <span className="text-sm text-slate-500">{fileName || 'Selecciona un fichero CSV'}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          </label>
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {rows.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700 mb-1">{rows.length} empleados detectados</p>
              <ul className="text-slate-500 space-y-0.5 max-h-32 overflow-y-auto">
                {rows.slice(0, 6).map((r, i) => (
                  <li key={i}>{r.name} · {r.email}</li>
                ))}
                {rows.length > 6 && <li>… y {rows.length - 6} más</li>}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-emerald-700 font-medium">
            <CheckCircle2 className="w-5 h-5" /> {result.created.length} empleados creados
          </div>
          {result.created.length > 0 && (
            <>
              <p className="text-sm text-slate-500">
                Reparte estas contraseñas temporales; las cambiarán en su primer acceso.
              </p>
              <div className="rounded-xl border border-slate-200 max-h-40 overflow-y-auto text-sm">
                {result.created.map((c) => (
                  <div
                    key={c.email}
                    className="flex justify-between gap-2 px-3 py-1.5 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-slate-600 truncate">{c.email}</span>
                    <code className="text-slate-900 shrink-0">{c.password}</code>
                  </div>
                ))}
              </div>
              <Button variant="secondary" onClick={downloadCredentials}>
                <Download className="w-4 h-4" /> Descargar credenciales
              </Button>
            </>
          )}
          {result.errors.length > 0 && (
            <div className="rounded-xl bg-rose-50 p-3 text-sm">
              <div className="flex items-center gap-2 text-rose-700 mb-1 font-medium">
                <AlertTriangle className="w-4 h-4" /> {result.errors.length} no se crearon
              </div>
              <ul className="text-rose-600 space-y-0.5 max-h-28 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i}>Fila {e.row} ({e.email || '—'}): {e.error}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
