import type { BulkEmployeeRow } from '@/types';

/** Divide una línea CSV respetando comillas dobles. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const normalize = (h: string): string =>
  h.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/** Cabeceras aceptadas (es/en) para cada campo. */
const HEADERS = {
  name: ['nombre', 'name'],
  email: ['email', 'correo', 'e-mail'],
  department: ['departamento', 'department', 'depto', 'area'],
  position: ['puesto', 'position', 'cargo'],
  password: ['password', 'contrasena', 'clave'],
};

export const CSV_TEMPLATE =
  'nombre,email,departamento,puesto,password\n' +
  'Juan Pérez,juan@empresa.com,Ventas,Comercial,\n' +
  'María López,maria@empresa.com,Almacén,Operaria,\n';

/** Parsea un CSV de empleados. La contraseña es opcional (columna vacía → temporal). */
export function parseEmployeesCsv(text: string): BulkEmployeeRow[] {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = withoutBom.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(normalize);
  const idx = (names: string[]) => headers.findIndex((h) => names.includes(h));
  const cols = {
    name: idx(HEADERS.name),
    email: idx(HEADERS.email),
    department: idx(HEADERS.department),
    position: idx(HEADERS.position),
    password: idx(HEADERS.password),
  };

  return lines
    .slice(1)
    .map((line) => {
      const c = splitCsvLine(line);
      const g = (i: number) => (i >= 0 ? (c[i] ?? '').trim() : '');
      const password = g(cols.password);
      return {
        name: g(cols.name),
        email: g(cols.email),
        department: g(cols.department),
        position: g(cols.position),
        password: password || undefined,
      };
    })
    .filter((r) => r.name || r.email);
}

/** Descarga un texto como fichero. */
export function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
