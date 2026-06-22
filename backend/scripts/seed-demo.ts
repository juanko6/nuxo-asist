/**
 * Script de datos demo para pruebas manuales.
 *
 * Crea:
 *  - 1 admin + 20 empleados en varios departamentos
 *  - 5 plantillas de horario (jornada completa, media jornada, turno mañana/tarde/noche)
 *  - Asignaciones de horario con historial (algunos cambiaron de turno)
 *  - ~5 meses de fichajes realistas con pausas, horas extra, correcciones y geo
 *  - Ausencias (vacaciones, bajas, permisos) distribuidas en el periodo
 *  - Notificaciones y logs de login
 *
 * Uso:
 *   DATABASE_URL=postgres://... tsx scripts/seed-demo.ts
 *   DATABASE_URL=postgres://... tsx scripts/seed-demo.ts --reset   ← borra los datos demo antes
 *
 * Es idempotente: si el admin demo ya existe aborta sin tocar nada (usa --reset para reiniciar).
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

// ─── helpers ─────────────────────────────────────────────────────────────────

function toDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function subDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}

function workdaysBetween(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

function rInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

function parseTime(hhmm: string): [number, number] {
  const parts = hhmm.split(':');
  return [parseInt(parts[0]!, 10), parseInt(parts[1]!, 10)];
}

// ─── datos maestros ───────────────────────────────────────────────────────────

const COMPANY = 'Nuxo Systems S.L.';

const ADMIN = {
  email: 'admin@nuxo.dev',
  password: 'Admin.1234',
  name: 'Ana García',
  department: 'Dirección',
  position: 'CEO',
};

const EMPLOYEES = [
  { name: 'Carlos Rodríguez',  email: 'carlos@nuxo.dev',    department: 'Tecnología',  position: 'Desarrollador Senior' },
  { name: 'María López',       email: 'maria@nuxo.dev',     department: 'Tecnología',  position: 'Desarrolladora Full-Stack' },
  { name: 'Javier Martínez',   email: 'javier@nuxo.dev',   department: 'Tecnología',  position: 'DevOps Engineer' },
  { name: 'Laura Sánchez',     email: 'laura@nuxo.dev',    department: 'Tecnología',  position: 'QA Engineer' },
  { name: 'Pedro Fernández',   email: 'pedro@nuxo.dev',    department: 'Tecnología',  position: 'Desarrollador Junior' },
  { name: 'Isabel González',   email: 'isabel@nuxo.dev',   department: 'Diseño',      position: 'UX Designer' },
  { name: 'Antonio Díaz',      email: 'antonio@nuxo.dev',  department: 'Diseño',      position: 'UI Designer' },
  { name: 'Carmen Ruiz',       email: 'carmen@nuxo.dev',   department: 'Marketing',   position: 'Marketing Manager' },
  { name: 'Francisco Torres',  email: 'francisco@nuxo.dev',department: 'Marketing',   position: 'Community Manager' },
  { name: 'Sofía Ramírez',     email: 'sofia@nuxo.dev',    department: 'Marketing',   position: 'SEO Specialist' },
  { name: 'Miguel Flores',     email: 'miguel@nuxo.dev',   department: 'Ventas',      position: 'Account Executive' },
  { name: 'Elena Moreno',      email: 'elena@nuxo.dev',    department: 'Ventas',      position: 'Sales Development Rep' },
  { name: 'Rubén Jiménez',     email: 'ruben@nuxo.dev',    department: 'Ventas',      position: 'Key Account Manager' },
  { name: 'Patricia Álvarez',  email: 'patricia@nuxo.dev', department: 'RRHH',        position: 'HR Manager' },
  { name: 'David Muñoz',       email: 'david@nuxo.dev',    department: 'RRHH',        position: 'Talent Acquisition' },
  { name: 'Natalia Romero',    email: 'natalia@nuxo.dev',  department: 'Finanzas',    position: 'Contable' },
  { name: 'Sergio García',     email: 'sergio@nuxo.dev',   department: 'Finanzas',    position: 'Controller Financiero' },
  { name: 'Beatriz Hernández', email: 'beatriz@nuxo.dev',  department: 'Operaciones', position: 'Operations Manager' },
  { name: 'Álvaro Navarro',    email: 'alvaro@nuxo.dev',   department: 'Operaciones', position: 'Técnico de Sistemas' },
  { name: 'Cristina Vega',     email: 'cristina@nuxo.dev', department: 'Operaciones', position: 'Soporte Técnico' },
] satisfies Array<{ name: string; email: string; department: string; position: string }>;

const TEMPLATES = [
  {
    name: 'Jornada completa L-V',
    description: '40h semanales, lunes a viernes',
    days: [
      { weekday: 1, start: '09:00', end: '17:00' },
      { weekday: 2, start: '09:00', end: '17:00' },
      { weekday: 3, start: '09:00', end: '17:00' },
      { weekday: 4, start: '09:00', end: '17:00' },
      { weekday: 5, start: '09:00', end: '17:00' },
    ],
  },
  {
    name: 'Media jornada mañana',
    description: '20h semanales, lunes a viernes',
    days: [
      { weekday: 1, start: '09:00', end: '13:00' },
      { weekday: 2, start: '09:00', end: '13:00' },
      { weekday: 3, start: '09:00', end: '13:00' },
      { weekday: 4, start: '09:00', end: '13:00' },
      { weekday: 5, start: '09:00', end: '13:00' },
    ],
  },
  {
    name: 'Turno de tarde',
    description: '40h semanales, 14:00–22:00',
    days: [
      { weekday: 1, start: '14:00', end: '22:00' },
      { weekday: 2, start: '14:00', end: '22:00' },
      { weekday: 3, start: '14:00', end: '22:00' },
      { weekday: 4, start: '14:00', end: '22:00' },
      { weekday: 5, start: '14:00', end: '22:00' },
    ],
  },
  {
    name: 'Turno de noche',
    description: '40h semanales, 22:00–06:00',
    days: [
      { weekday: 1, start: '22:00', end: '06:00' },
      { weekday: 2, start: '22:00', end: '06:00' },
      { weekday: 3, start: '22:00', end: '06:00' },
      { weekday: 4, start: '22:00', end: '06:00' },
      { weekday: 5, start: '22:00', end: '06:00' },
    ],
  },
  {
    name: 'Flexible L-V',
    description: '40h semanales, entrada flexible, viernes intensivo',
    days: [
      { weekday: 1, start: '08:30', end: '17:30' },
      { weekday: 2, start: '08:30', end: '17:30' },
      { weekday: 3, start: '08:30', end: '17:30' },
      { weekday: 4, start: '08:30', end: '17:30' },
      { weekday: 5, start: '08:30', end: '14:30' },
    ],
  },
] as const;

// Asignación de plantilla por empleado. Algunos tienen cambio de turno a mitad de periodo.
// Cada entrada: { templateIdx, fromMonthsAgo } ordenados del más antiguo al más reciente.
const SCHEDULE_PLAN: Array<Array<{ templateIdx: number; fromMonthsAgo: number }>> = [
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 4, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }, { templateIdx: 2, fromMonthsAgo: 2 }], // cambio a tarde
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 1, fromMonthsAgo: 5 }, { templateIdx: 0, fromMonthsAgo: 3 }], // media → completa
  [{ templateIdx: 4, fromMonthsAgo: 5 }],
  [{ templateIdx: 4, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 2, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 1, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 4, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }],
  [{ templateIdx: 0, fromMonthsAgo: 5 }, { templateIdx: 3, fromMonthsAgo: 1 }], // cambio a noche
  [{ templateIdx: 3, fromMonthsAgo: 5 }],
  [{ templateIdx: 1, fromMonthsAgo: 5 }],
];

const OFFICE = { lat: 40.416775, lng: -3.70379, radius: 200 };

function randomCoord(inside: boolean): { lat: number; lng: number } {
  const spread = inside ? 0.0005 : 0.005;
  return {
    lat: OFFICE.lat + (Math.random() - 0.5) * spread,
    lng: OFFICE.lng + (Math.random() - 0.5) * spread,
  };
}

// ─── main ─────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL no está definida');
  process.exit(1);
}

pg.types.setTypeParser(1082, (v: string) => v);
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const RESET = process.argv.includes('--reset');

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const START = new Date(TODAY);
START.setMonth(START.getMonth() - 5);
START.setDate(1);

const client = await pool.connect();

try {
  await client.query('BEGIN');

  // ── 0. reset opcional ──────────────────────────────────────────────────────
  if (RESET) {
    console.log('🗑️  Borrando datos demo existentes…');
    const { rows: demoUsers } = await client.query<{ id: string }>(
      `SELECT id FROM users WHERE email LIKE '%@nuxo.dev'`
    );
    const ids = demoUsers.map((r) => r.id);
    if (ids.length) {
      await client.query(`DELETE FROM absence_alerts  WHERE employee_id = ANY($1)`, [ids]);
      await client.query(`DELETE FROM absences        WHERE employee_id = ANY($1) OR created_by = ANY($1)`, [ids]);
      await client.query(`DELETE FROM notifications   WHERE employee_id = ANY($1)`, [ids]);
      await client.query(`DELETE FROM login_logs      WHERE employee_id = ANY($1)`, [ids]);
      await client.query(`DELETE FROM employee_schedules WHERE employee_id = ANY($1)`, [ids]);
      await client.query(`DELETE FROM users           WHERE id = ANY($1)`, [ids]);
    }
    await client.query(`DELETE FROM schedule_templates WHERE name = ANY($1)`, [
      TEMPLATES.map((t) => t.name),
    ]);
    await client.query(`DELETE FROM app_settings WHERE id = 1`);
    console.log('   ✓ Datos borrados\n');
  }

  // ── 1. app_settings ────────────────────────────────────────────────────────
  await client.query(
    `INSERT INTO app_settings (id, company_name, geolocation_mode, geofence_lat, geofence_lng, geofence_radius_m)
     VALUES (1, $1, 'optional', $2, $3, $4)
     ON CONFLICT (id) DO UPDATE SET
       company_name      = EXCLUDED.company_name,
       geolocation_mode  = EXCLUDED.geolocation_mode,
       geofence_lat      = EXCLUDED.geofence_lat,
       geofence_lng      = EXCLUDED.geofence_lng,
       geofence_radius_m = EXCLUDED.geofence_radius_m,
       updated_at        = now()`,
    [COMPANY, OFFICE.lat, OFFICE.lng, OFFICE.radius]
  );
  console.log(`✓ Empresa: ${COMPANY}`);

  // ── 2. admin ───────────────────────────────────────────────────────────────
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [ADMIN.email]
  );
  if (existing.length) {
    console.log(`⚠️  Admin ${ADMIN.email} ya existe. Usa --reset para reiniciar.`);
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
    process.exit(0);
  }

  const adminHash = await bcrypt.hash(ADMIN.password, 10);
  const { rows: adminRows } = await client.query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash, role, department, position, status, must_change_password)
     VALUES ($1,$2,$3,'admin',$4,$5,'active',false)
     RETURNING id`,
    [ADMIN.email, ADMIN.name, adminHash, ADMIN.department, ADMIN.position]
  );
  const adminId = adminRows[0]!.id;
  console.log(`✓ Admin: ${ADMIN.name} <${ADMIN.email}>`);

  // ── 3. empleados ───────────────────────────────────────────────────────────
  const employeeIds: string[] = [];
  const empHash = await bcrypt.hash('Empleado.1234', 10);

  for (const emp of EMPLOYEES) {
    const pin = String(rInt(1000, 9999));
    const pinHash = await bcrypt.hash(pin, 6);
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO users (email, name, password_hash, role, department, position, status, must_change_password, pin_hash)
       VALUES ($1,$2,$3,'employee',$4,$5,'active',false,$6)
       RETURNING id`,
      [emp.email, emp.name, empHash, emp.department, emp.position, pinHash]
    );
    employeeIds.push(rows[0]!.id);
  }
  console.log(`✓ ${EMPLOYEES.length} empleados (contraseña: Empleado.1234)`);

  // ── 4. plantillas de horario ───────────────────────────────────────────────
  const templateIds: string[] = [];
  for (const tpl of TEMPLATES) {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO schedule_templates (name, description)
       VALUES ($1,$2)
       ON CONFLICT (lower(name)) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      [tpl.name, tpl.description]
    );
    const tplId = rows[0]!.id;
    templateIds.push(tplId);
    for (const day of tpl.days) {
      await client.query(
        `INSERT INTO schedule_template_days (template_id, weekday, start_time, end_time)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (template_id, weekday, start_time) DO NOTHING`,
        [tplId, day.weekday, day.start, day.end]
      );
    }
  }
  console.log(`✓ ${TEMPLATES.length} plantillas de horario`);

  // ── 5. asignaciones de horario ─────────────────────────────────────────────
  for (let i = 0; i < employeeIds.length; i++) {
    const empId = employeeIds[i]!;
    const plan = (SCHEDULE_PLAN[i] ?? [{ templateIdx: 0, fromMonthsAgo: 5 }])
      .slice()
      .sort((a, b) => b.fromMonthsAgo - a.fromMonthsAgo);

    for (let j = 0; j < plan.length; j++) {
      const entry = plan[j]!;
      const tplId = templateIds[entry.templateIdx]!;

      const validFrom = new Date(TODAY);
      validFrom.setMonth(validFrom.getMonth() - entry.fromMonthsAgo);
      validFrom.setDate(1);

      let validTo: string | null = null;
      if (j < plan.length - 1) {
        const nextEntry = plan[j + 1]!;
        const nextFrom = new Date(TODAY);
        nextFrom.setMonth(nextFrom.getMonth() - nextEntry.fromMonthsAgo);
        nextFrom.setDate(1);
        validTo = toDate(subDays(nextFrom, 1));
      }

      await client.query(
        `INSERT INTO employee_schedules (employee_id, template_id, valid_from, valid_to)
         VALUES ($1,$2,$3,$4)`,
        [empId, tplId, toDate(validFrom), validTo]
      );
    }
  }
  console.log(`✓ Asignaciones de horario (con historial de cambios)`);

  // ── 6. mapa en memoria: horario activo de un empleado en una fecha ─────────
  const tplDaysMap = new Map<string, Array<{ weekday: number; start: string; end: string }>>();
  for (let i = 0; i < templateIds.length; i++) {
    const tpl = TEMPLATES[i]!;
    tplDaysMap.set(
      templateIds[i]!,
      tpl.days.map((d) => ({ weekday: d.weekday, start: d.start, end: d.end }))
    );
  }

  type ScheduleEntry = { tplId: string; from: Date; to: Date | null };
  const schedulesByEmp = new Map<string, ScheduleEntry[]>();

  for (let i = 0; i < employeeIds.length; i++) {
    const empId = employeeIds[i]!;
    const plan = (SCHEDULE_PLAN[i] ?? [{ templateIdx: 0, fromMonthsAgo: 5 }])
      .slice()
      .sort((a, b) => b.fromMonthsAgo - a.fromMonthsAgo);

    const entries: ScheduleEntry[] = plan.map((p, j) => {
      const from = new Date(TODAY);
      from.setMonth(from.getMonth() - p.fromMonthsAgo);
      from.setDate(1);
      let to: Date | null = null;
      if (j < plan.length - 1) {
        const nextP = plan[j + 1]!;
        const nextFrom = new Date(TODAY);
        nextFrom.setMonth(nextFrom.getMonth() - nextP.fromMonthsAgo);
        nextFrom.setDate(1);
        to = subDays(nextFrom, 1);
      }
      return { tplId: templateIds[p.templateIdx]!, from, to };
    });
    schedulesByEmp.set(empId, entries);
  }

  function getScheduleForDay(empId: string, day: Date): { start: string; end: string } | null {
    for (const entry of schedulesByEmp.get(empId) ?? []) {
      if (day >= entry.from && (entry.to === null || day <= entry.to)) {
        const iso = isoWeekday(day);
        const dayDef = (tplDaysMap.get(entry.tplId) ?? []).find((d) => d.weekday === iso);
        return dayDef ?? null;
      }
    }
    return null;
  }

  // ── 7. ausencias (pre-calculadas para saltar fichajes en esos días) ─────────
  const absenceDates = new Map<number, Set<string>>();
  for (let i = 0; i < EMPLOYEES.length; i++) absenceDates.set(i, new Set());

  type AbsenceDef = {
    empIdx: number;
    type: 'vacation' | 'sick_leave' | 'leave' | 'other';
    startDay: Date;
    endDay: Date;
    reason: string;
  };
  const plannedAbsences: AbsenceDef[] = [];

  const absenceReasons = {
    sick:  ['Gripe', 'Gastroenteritis', 'Lumbalgia', 'Consulta médica'] as const,
    leave: ['Cita médica', 'Trámite administrativo', 'Asuntos familiares', 'Mudanza'] as const,
  };

  for (let i = 0; i < EMPLOYEES.length; i++) {
    const set = absenceDates.get(i)!;

    const markRange = (start: Date, end: Date) => {
      const cur = new Date(start);
      while (cur <= end) { set.add(toDate(cur)); cur.setDate(cur.getDate() + 1); }
    };

    const alignToWeekday = (d: Date, forward: boolean) => {
      while (d.getDay() === 0 || d.getDay() === 6)
        d.setDate(d.getDate() + (forward ? 1 : -1));
    };

    // Vacaciones: 1 o 2 periodos por empleado
    for (let p = 0; p < (i % 3 === 0 ? 2 : 1); p++) {
      const s = subDays(TODAY, rInt(30, 140) + p * 20);
      alignToWeekday(s, true);
      const e = new Date(s);
      e.setDate(e.getDate() + rInt(5, 15));
      alignToWeekday(e, false);
      if (s >= START && e < TODAY) {
        plannedAbsences.push({ empIdx: i, type: 'vacation', startDay: s, endDay: e, reason: 'Vacaciones anuales' });
        markRange(s, e);
      }
    }

    // Baja médica: ~1/3 de empleados
    if (i % 3 === 1) {
      const s = subDays(TODAY, rInt(10, 80));
      alignToWeekday(s, true);
      const e = new Date(s);
      e.setDate(e.getDate() + rInt(2, 5));
      alignToWeekday(e, false);
      if (s >= START && e < TODAY) {
        plannedAbsences.push({
          empIdx: i, type: 'sick_leave', startDay: s, endDay: e,
          reason: pick(absenceReasons.sick),
        });
        markRange(s, e);
      }
    }

    // Permiso puntual: ~1/4 de empleados
    if (i % 4 === 0) {
      const s = subDays(TODAY, rInt(5, 60));
      alignToWeekday(s, true);
      if (s >= START && s < TODAY) {
        plannedAbsences.push({
          empIdx: i, type: 'leave', startDay: s, endDay: s,
          reason: pick(absenceReasons.leave),
        });
        set.add(toDate(s));
      }
    }
  }

  // ── 8. fichajes ────────────────────────────────────────────────────────────
  const workdays = workdaysBetween(START, subDays(TODAY, 1));
  let attendanceCount = 0, overtimeNotifCount = 0, manualCount = 0, pauseCount = 0, correctionCount = 0;

  const pauseReasons = ['Comida', 'Descanso', 'Café', null] as const;
  const correctionReasons = ['Error en el sistema', 'Empleado reportó error', 'Revisión de turno'] as const;

  for (let i = 0; i < employeeIds.length; i++) {
    const empId = employeeIds[i]!;
    const emp = EMPLOYEES[i]!;
    const vacDays = absenceDates.get(i)!;

    for (const day of workdays) {
      const dateStr = toDate(day);
      if (vacDays.has(dateStr)) continue;

      const sched = getScheduleForDay(empId, day);
      if (!sched) continue;

      // ~8% de días sin fichar (simula ausencias injustificadas)
      if (Math.random() < 0.08) continue;

      const [startH, startM] = parseTime(sched.start);
      const [endH, endM] = parseTime(sched.end);

      const checkInDate = new Date(day);
      checkInDate.setHours(startH, startM + rInt(-5, 15), rInt(0, 59), 0);
      const checkInIso = checkInDate.toISOString();

      // Duración nominal (soporta turnos nocturnos)
      const nominalMins =
        endH > startH || (endH === startH && endM >= startM)
          ? (endH - startH) * 60 + (endM - startM)
          : (24 - startH + endH) * 60 + (endM - startM);
      const actualMins = nominalMins + rInt(-30, 90);
      const checkOutIso = addMinutes(checkInIso, actualMins);

      const isManual = Math.random() < 0.05;
      const source = isManual ? 'manual' : 'realtime';
      const status = isManual
        ? pick(['confirmed', 'pending_validation', 'rejected'] as const)
        : 'confirmed';

      const overtimeRequested = actualMins > nominalMins + 15 && Math.random() < 0.30;
      const overtimeApproved = overtimeRequested && Math.random() < 0.70;

      const hasGeo = Math.random() < 0.80;
      const inGeo = Math.random() > 0.10;
      const geoIn = hasGeo ? randomCoord(inGeo) : null;
      const geoOut = hasGeo ? randomCoord(true) : null;

      const { rows: attRows } = await client.query<{ id: string }>(
        `INSERT INTO attendance
           (employee_id, employee_name, check_in, check_out, source, status,
            overtime_requested, overtime_approved,
            check_in_lat,  check_in_lng,  check_in_outside,
            check_out_lat, check_out_lng, check_out_outside)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          empId, emp.name, checkInIso, checkOutIso, source, status,
          overtimeRequested, overtimeApproved,
          geoIn?.lat  ?? null, geoIn?.lng  ?? null, hasGeo ? !inGeo : null,
          geoOut?.lat ?? null, geoOut?.lng ?? null, false,
        ]
      );
      const attId = attRows[0]!.id;
      attendanceCount++;

      // Pausa de comida (jornadas largas, 50% de probabilidad)
      if (actualMins >= 240 && Math.random() < 0.50) {
        const ps = addMinutes(checkInIso, rInt(150, 210));
        const pe = addMinutes(ps, rInt(20, 60));
        await client.query(
          `INSERT INTO attendance_pauses (attendance_id, pause_start, pause_end, reason)
           VALUES ($1,$2,$3,$4)`,
          [attId, ps, pe, pick(pauseReasons)]
        );
        pauseCount++;
      }

      // Corrección en auditoría (3% de registros)
      if (Math.random() < 0.03) {
        const origIn = addMinutes(checkInIso, -rInt(5, 30));
        await client.query(
          `INSERT INTO attendance_audit
             (attendance_id, actor_id, actor_name, action, reason, changes)
           VALUES ($1,$2,$3,'correction',$4,$5)`,
          [
            attId, adminId, ADMIN.name,
            pick(correctionReasons),
            JSON.stringify({ check_in: { from: origIn, to: checkInIso } }),
          ]
        );
        correctionCount++;
      }

      // Notificación de horas extra sin aprobar (últimos 15 días)
      if (overtimeRequested && !overtimeApproved && day >= subDays(TODAY, 15)) {
        await client.query(
          `INSERT INTO notifications
             (employee_id, employee_name, attendance_id, message, type, read)
           VALUES ($1,$2,$3,$4,'overtime_request',false)`,
          [empId, emp.name, attId, `${emp.name} solicita horas extra el ${dateStr}`]
        );
        overtimeNotifCount++;
      }

      // Auditoría de entrada manual
      if (isManual && status === 'pending_validation') {
        await client.query(
          `INSERT INTO attendance_audit
             (attendance_id, actor_id, actor_name, action, reason, changes)
           VALUES ($1,$2,$3,'manual_create','Registro olvidado — entrada manual','{}')`,
          [attId, empId, emp.name]
        );
        manualCount++;
      }
    }
  }

  console.log(`✓ Fichajes: ${attendanceCount} registros`);
  console.log(`  · ${pauseCount} pausas de jornada`);
  console.log(`  · ${overtimeNotifCount} horas extra pendientes de aprobar`);
  console.log(`  · ${manualCount} entradas manuales pendientes de validar`);
  console.log(`  · ${correctionCount} correcciones con auditoría`);

  // ── 9. ausencias ───────────────────────────────────────────────────────────
  let absenceCount = 0;
  for (const abs of plannedAbsences) {
    const empId = employeeIds[abs.empIdx]!;
    const emp = EMPLOYEES[abs.empIdx]!;
    await client.query(
      `INSERT INTO absences (employee_id, type, start_date, end_date, reason, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [empId, abs.type, toDate(abs.startDay), toDate(abs.endDay), abs.reason, adminId]
    );
    if (abs.type === 'vacation' && abs.endDay < TODAY) {
      await client.query(
        `INSERT INTO notifications (employee_id, employee_name, message, type, read)
         VALUES ($1,$2,$3,'info',true)`,
        [
          empId, emp.name,
          `Vacaciones del ${toDate(abs.startDay)} al ${toDate(abs.endDay)} registradas`,
        ]
      );
    }
    absenceCount++;
  }
  console.log(`✓ ${absenceCount} ausencias (vacaciones, bajas médicas, permisos)`);

  // ── 10. logs de login ──────────────────────────────────────────────────────
  let loginCount = 0;
  for (let i = 0; i < employeeIds.length; i++) {
    const empId = employeeIds[i]!;
    const emp = EMPLOYEES[i]!;
    for (let l = 0; l < rInt(20, 60); l++) {
      const loginDay = subDays(TODAY, rInt(1, 150));
      loginDay.setHours(rInt(7, 10), rInt(0, 59), 0, 0);
      await client.query(
        `INSERT INTO login_logs (employee_id, employee_name, login_time) VALUES ($1,$2,$3)`,
        [empId, emp.name, loginDay.toISOString()]
      );
      loginCount++;
    }
  }
  console.log(`✓ ${loginCount} registros de login`);

  await client.query('COMMIT');

  console.log('\n✅ Seed demo completado.\n');
  console.log('   Admin:     ' + ADMIN.email + '  /  ' + ADMIN.password);
  console.log('   Empleados: *@nuxo.dev  /  Empleado.1234');
  console.log('   PIN kiosco: 4 dígitos aleatorio por empleado (cámbialo desde el panel admin)\n');
} catch (err) {
  await client.query('ROLLBACK');
  console.error('❌ Error durante el seed:', err);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
