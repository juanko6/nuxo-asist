import type { Pool } from 'pg';

export interface AbsenceCheckOptions {
  timezone: string;
}

export interface FlaggedAbsence {
  employee_id: string;
  email: string;
  name: string;
  date: string; // 'YYYY-MM-DD'
}

/**
 * Detecta ausencias injustificadas para `forDate` (por defecto, el día anterior
 * en la zona horaria de negocio). Un empleado se marca si:
 *  - tenía un día laborable según su horario activo (HU-05) ese día,
 *  - no tiene ningún fichaje no rechazado ese día, y
 *  - no está cubierto por una ausencia registrada (vacaciones/baja/permiso).
 * Crea una notificación in-app `absence` (idempotente vía absence_alerts) y
 * devuelve los empleados marcados para el envío de email best-effort.
 */
export async function detectAbsences(
  pool: Pool,
  opts: AbsenceCheckOptions,
  forDate?: string
): Promise<FlaggedAbsence[]> {
  let date = forDate;
  if (!date) {
    const { rows } = await pool.query<{ d: string }>(
      `SELECT to_char((now() AT TIME ZONE $1)::date - 1, 'YYYY-MM-DD') AS d`,
      [opts.timezone]
    );
    date = rows[0]!.d;
  }

  const { rows: candidates } = await pool.query<{ id: string; email: string; name: string }>(
    `SELECT u.id, u.email, u.name
     FROM users u
     WHERE u.role = 'employee'
       AND EXISTS (
         SELECT 1 FROM employee_schedules es
         JOIN schedule_template_days d ON d.template_id = es.template_id
         WHERE es.employee_id = u.id
           AND es.valid_from <= $1::date
           AND (es.valid_to IS NULL OR es.valid_to >= $1::date)
           AND d.weekday = EXTRACT(ISODOW FROM $1::date)
       )
       AND NOT EXISTS (
         SELECT 1 FROM attendance a
         WHERE a.employee_id = u.id
           AND a.status <> 'rejected'
           AND (a.check_in AT TIME ZONE $2)::date = $1::date
       )
       AND NOT EXISTS (
         SELECT 1 FROM absences ab
         WHERE ab.employee_id = u.id
           AND $1::date BETWEEN ab.start_date AND ab.end_date
       )`,
    [date, opts.timezone]
  );

  const flagged: FlaggedAbsence[] = [];
  for (const u of candidates) {
    const ins = await pool.query(
      `INSERT INTO absence_alerts (employee_id, alert_date)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [u.id, date]
    );
    if (ins.rowCount === 1) {
      await pool.query(
        `INSERT INTO notifications (employee_id, employee_name, attendance_id, message, type)
         VALUES ($1, $2, NULL, $3, 'absence')`,
        [
          u.id,
          u.name,
          `Se registra una ausencia el ${date} sin que conste vacaciones o baja. Justifícala con tu responsable.`,
        ]
      );
      flagged.push({ employee_id: u.id, email: u.email, name: u.name, date });
    }
  }

  return flagged;
}
