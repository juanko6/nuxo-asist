import type { Pool } from 'pg';
import { recordAudit } from './audit.js';

export interface AutoCloseOptions {
  timezone: string;
  warnMinutes: number;
  graceMinutes: number;
  maxShiftHours: number;
}

export interface AutoCloseResult {
  warned: string[];
  closed: string[];
}

interface OpenShift {
  id: string;
  employee_id: string;
  employee_name: string;
  check_in: Date;
  close_warning_sent_at: Date | null;
  auto_close_snooze_until: Date | null;
  theoretical_end: Date | null;
}

/**
 * Una pasada de cierre automático (HU-03). El parámetro `now` se inyecta para
 * poder testear sin depender del reloj. Por cada jornada abierta:
 *  - pasada la hora teórica de salida + warnMinutes, avisa una vez (¿sigues
 *    trabajando?) si no se avisó antes;
 *  - pasada la hora teórica + graceMinutes, cierra el turno a la hora teórica
 *    de fin y deja huella `system_close` en la auditoría.
 * La hora teórica sale del horario activo del empleado (HU-05); si no tiene,
 * se usa check_in + maxShiftHours como red de seguridad.
 */
export async function processAutoClose(
  pool: Pool,
  opts: AutoCloseOptions,
  now: Date = new Date()
): Promise<AutoCloseResult> {
  const { rows } = await pool.query<OpenShift>(
    `WITH open_shifts AS (
       SELECT a.id, a.employee_id, a.employee_name, a.check_in, a.close_warning_sent_at,
         a.auto_close_snooze_until,
         (a.check_in AT TIME ZONE $1)::date AS local_date,
         EXTRACT(ISODOW FROM (a.check_in AT TIME ZONE $1))::int AS weekday
       FROM attendance a
       WHERE a.check_out IS NULL AND a.status <> 'rejected'
     ),
     blocks AS (
       SELECT os.id,
         min(d.start_time) AS start_time,
         max(d.end_time) AS end_time
       FROM open_shifts os
       JOIN employee_schedules es ON es.employee_id = os.employee_id
         AND es.valid_from <= os.local_date
         AND (es.valid_to IS NULL OR es.valid_to >= os.local_date)
       JOIN schedule_template_days d ON d.template_id = es.template_id
         AND d.weekday = os.weekday
       GROUP BY os.id
     )
     SELECT os.id, os.employee_id, os.employee_name, os.check_in, os.close_warning_sent_at,
       os.auto_close_snooze_until,
       CASE WHEN b.end_time IS NOT NULL THEN
         ((os.local_date + b.end_time
           + CASE WHEN b.end_time <= b.start_time THEN interval '1 day' ELSE interval '0' END)
          AT TIME ZONE $1)
       END AS theoretical_end
     FROM open_shifts os
     LEFT JOIN blocks b ON b.id = os.id`,
    [opts.timezone]
  );

  const warned: string[] = [];
  const closed: string[] = [];
  const nowMs = now.getTime();

  for (const r of rows) {
    // El empleado confirmó que sigue trabajando ("Sigo aquí"): respetar el
    // aplazamiento hasta que caduque, sin avisar ni cerrar.
    if (r.auto_close_snooze_until && nowMs < new Date(r.auto_close_snooze_until).getTime()) {
      continue;
    }

    const endMs = r.theoretical_end
      ? new Date(r.theoretical_end).getTime()
      : new Date(r.check_in).getTime() + opts.maxShiftHours * 3_600_000;
    const warnAtMs = endMs + opts.warnMinutes * 60_000;
    const closeAtMs = endMs + opts.graceMinutes * 60_000;

    if (nowMs >= closeAtMs) {
      const closeIso = new Date(endMs).toISOString();
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const upd = await client.query(
          'UPDATE attendance SET check_out = $2 WHERE id = $1 AND check_out IS NULL',
          [r.id, closeIso]
        );
        if (upd.rowCount === 1) {
          await recordAudit(client, {
            attendanceId: r.id,
            actorId: null,
            actorName: 'Sistema',
            action: 'system_close',
            reason: 'Cierre automático por turno no finalizado',
            changes: { check_out: { old: null, new: closeIso } },
          });
          await client.query(
            `INSERT INTO notifications (employee_id, employee_name, attendance_id, message, type)
             VALUES ($1, $2, $3, $4, 'info')`,
            [
              r.employee_id,
              r.employee_name,
              r.id,
              `Tu turno se cerró automáticamente a las ${closeIso}. Revisa si es correcto.`,
            ]
          );
          closed.push(r.id);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else if (nowMs >= warnAtMs && !r.close_warning_sent_at) {
      await pool.query('UPDATE attendance SET close_warning_sent_at = $2 WHERE id = $1', [
        r.id,
        now.toISOString(),
      ]);
      await pool.query(
        `INSERT INTO notifications (employee_id, employee_name, attendance_id, message, type)
         VALUES ($1, $2, $3, $4, 'info')`,
        [
          r.employee_id,
          r.employee_name,
          r.id,
          '¿Sigues trabajando? Tu jornada ha superado la hora de salida prevista.',
        ]
      );
      warned.push(r.id);
    }
  }

  return { warned, closed };
}
