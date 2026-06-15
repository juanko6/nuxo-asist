import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { recordAudit } from '../lib/audit.js';
import type {
  AttendanceRecord,
  AttendancePause,
  AttendanceAuditEntry,
} from '../types.js';

const ListQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha esperado: YYYY-MM-DD')
    .optional(),
  employee_id: z.string().uuid().optional(),
});

const PauseStartSchema = z.object({ reason: z.string().max(200).optional() });

const CorrectionSchema = z
  .object({
    check_in: z.string().datetime({ offset: true }).optional(),
    check_out: z.string().datetime({ offset: true }).nullable().optional(),
    reason: z.string().min(3, 'El motivo de la corrección es obligatorio'),
  })
  .refine((d) => d.check_in !== undefined || d.check_out !== undefined, {
    message: 'Indica al menos check_in o check_out a corregir',
  });

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD');
const ExportQuerySchema = z.object({
  from: DateOnly.optional(),
  to: DateOnly.optional(),
});

const ManualEntrySchema = z
  .object({
    check_in: z.string().datetime({ offset: true }),
    check_out: z.string().datetime({ offset: true }).optional(),
    reason: z.string().max(300).optional(),
  })
  .refine(
    (d) => d.check_out === undefined || new Date(d.check_out) >= new Date(d.check_in),
    { message: 'La salida no puede ser anterior a la entrada' }
  );

const ValidateSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().max(300).optional(),
});

const IdParams = z.object({ id: z.string().uuid() });

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

type PauseSpan = { pause_start: Date; pause_end: Date | null };

/** Milisegundos pausados; las pausas abiertas se cuentan hasta `upTo`. */
const pauseMs = (pauses: PauseSpan[], upTo: number): number =>
  pauses.reduce((sum, p) => {
    const start = new Date(p.pause_start).getTime();
    const end = p.pause_end ? new Date(p.pause_end).getTime() : upTo;
    return sum + Math.max(0, end - start);
  }, 0);

/** Minutos trabajados (bruto menos pausas); null si la jornada sigue abierta. */
const workedMinutes = (record: AttendanceRecord, pauses: PauseSpan[]): number | null => {
  if (!record.check_out) return null;
  const out = new Date(record.check_out).getTime();
  const gross = out - new Date(record.check_in).getTime();
  return Math.max(0, Math.round((gross - pauseMs(pauses, out)) / 60000));
};

const csvField = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const attendanceRoutes: FastifyPluginAsync = async (app) => {
  const employeeOnly = {
    preHandler: [
      app.authenticate,
      async (request: Parameters<typeof app.authenticate>[0]) => {
        if (request.currentUser.role !== 'employee') {
          throw forbidden('Solo los empleados fichan entrada y salida');
        }
      },
    ],
  };

  const tz = () => app.config.appTimezone;

  app.get('/attendance', { preHandler: [app.authenticate] }, async (request) => {
    const query = ListQuerySchema.parse(request.query);
    const conditions: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      conditions.push(sql.replace('?', `$${values.length}`));
    };

    if (request.currentUser.role === 'employee') {
      add('employee_id = ?', request.currentUser.id);
    } else if (query.employee_id) {
      add('employee_id = ?', query.employee_id);
    }
    if (query.date) {
      values.push(tz());
      const tzParam = `$${values.length}`;
      values.push(query.date);
      conditions.push(`(check_in AT TIME ZONE ${tzParam})::date = $${values.length}::date`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await app.pg.query<AttendanceRecord>(
      `SELECT * FROM attendance ${where} ORDER BY check_in DESC`,
      values
    );
    return rows;
  });

  app.post('/attendance/check-in', employeeOnly, async (request, reply) => {
    const { id: employeeId, name } = request.currentUser;

    const { rows: existing } = await app.pg.query(
      `SELECT id FROM attendance
       WHERE employee_id = $1
       AND (check_in AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
      [employeeId, tz()]
    );
    if (existing.length > 0) {
      throw conflict('Ya has fichado la entrada hoy');
    }

    try {
      const { rows } = await app.pg.query<AttendanceRecord>(
        `INSERT INTO attendance (employee_id, employee_name)
         VALUES ($1, $2)
         RETURNING *`,
        [employeeId, name]
      );
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict('Tienes un fichaje abierto pendiente de cerrar');
      }
      throw err;
    }
  });

  app.post('/attendance/check-out', employeeOnly, async (request) => {
    const { rows: openPause } = await app.pg.query(
      `SELECT 1 FROM attendance_pauses p
       JOIN attendance a ON a.id = p.attendance_id
       WHERE a.employee_id = $1 AND a.check_out IS NULL AND p.pause_end IS NULL`,
      [request.currentUser.id]
    );
    if (openPause.length > 0) {
      throw conflict('Tienes una pausa abierta; reanuda antes de fichar salida');
    }

    const { rows } = await app.pg.query<AttendanceRecord>(
      `UPDATE attendance SET check_out = now()
       WHERE employee_id = $1
       AND check_out IS NULL
       AND (check_in AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date
       RETURNING *`,
      [request.currentUser.id, tz()]
    );
    if (!rows[0]) {
      throw conflict('No hay un fichaje de entrada abierto hoy');
    }
    return rows[0];
  });

  // --- HU-04: pausas intrajornada ---

  app.post('/attendance/pause/start', employeeOnly, async (request, reply) => {
    const { reason } = PauseStartSchema.parse(request.body ?? {});

    const { rows: open } = await app.pg.query<{ id: string }>(
      `SELECT id FROM attendance
       WHERE employee_id = $1 AND check_out IS NULL
       AND (check_in AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
      [request.currentUser.id, tz()]
    );
    const attendance = open[0];
    if (!attendance) {
      throw conflict('No tienes una jornada abierta para pausar');
    }

    try {
      const { rows } = await app.pg.query<AttendancePause>(
        `INSERT INTO attendance_pauses (attendance_id, reason)
         VALUES ($1, $2) RETURNING *`,
        [attendance.id, reason ?? null]
      );
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict('Ya tienes una pausa abierta');
      }
      throw err;
    }
  });

  app.post('/attendance/pause/end', employeeOnly, async (request) => {
    const { rows } = await app.pg.query<AttendancePause>(
      `UPDATE attendance_pauses SET pause_end = now()
       WHERE pause_end IS NULL
       AND attendance_id IN (
         SELECT id FROM attendance WHERE employee_id = $1 AND check_out IS NULL
       )
       RETURNING *`,
      [request.currentUser.id]
    );
    if (!rows[0]) {
      throw conflict('No tienes una pausa abierta');
    }
    return rows[0];
  });

  // --- HU-04: detalle con pausas/auditoría, corrección con traza y export CSV ---

  app.get('/attendance/export.csv', {
    preHandler: [app.authenticate, app.requireAdmin],
  }, async (request, reply) => {
    const q = ExportQuerySchema.parse(request.query);
    const conditions: string[] = [];
    const values: unknown[] = [tz()]; // $1 = zona horaria de negocio
    if (q.from) {
      values.push(q.from);
      conditions.push(`(a.check_in AT TIME ZONE $1)::date >= $${values.length}::date`);
    }
    if (q.to) {
      values.push(q.to);
      conditions.push(`(a.check_in AT TIME ZONE $1)::date <= $${values.length}::date`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await app.pg.query(
      `SELECT a.*,
         to_char(a.check_in AT TIME ZONE $1, 'YYYY-MM-DD') AS local_date,
         COALESCE(EXTRACT(EPOCH FROM SUM(
           CASE WHEN p.id IS NOT NULL
             THEN COALESCE(p.pause_end, now()) - p.pause_start
             ELSE interval '0' END
         )) / 60, 0) AS pause_minutes,
         EXISTS (SELECT 1 FROM attendance_audit au WHERE au.attendance_id = a.id) AS corrected
       FROM attendance a
       LEFT JOIN attendance_pauses p ON p.attendance_id = a.id
       ${where}
       GROUP BY a.id
       ORDER BY a.check_in`,
      values
    );

    const header = [
      'employee_id', 'employee_name', 'date', 'check_in', 'check_out',
      'pause_minutes', 'worked_minutes', 'overtime_approved', 'corrected',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      const pauseMin = Math.round(Number(r.pause_minutes));
      let worked = '';
      if (r.check_out) {
        const gross =
          (new Date(r.check_out).getTime() - new Date(r.check_in).getTime()) / 60000;
        worked = String(Math.max(0, Math.round(gross - pauseMin)));
      }
      lines.push([
        r.employee_id,
        r.employee_name,
        r.local_date,
        new Date(r.check_in).toISOString(),
        r.check_out ? new Date(r.check_out).toISOString() : '',
        pauseMin,
        worked,
        r.overtime_approved ? 'si' : 'no',
        r.corrected ? 'si' : 'no',
      ].map(csvField).join(','));
    }
    const csv = lines.join('\r\n') + '\r\n';

    return reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="asistencia.csv"')
      .send(csv);
  });

  app.get('/attendance/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { rows } = await app.pg.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE id = $1',
      [id]
    );
    const record = rows[0];
    if (!record) throw notFound('Registro de asistencia no encontrado');
    if (
      request.currentUser.role === 'employee' &&
      record.employee_id !== request.currentUser.id
    ) {
      throw forbidden('Solo puedes consultar tus propios registros');
    }

    const { rows: pauses } = await app.pg.query<AttendancePause>(
      'SELECT * FROM attendance_pauses WHERE attendance_id = $1 ORDER BY pause_start',
      [id]
    );
    const { rows: audit } = await app.pg.query<AttendanceAuditEntry>(
      'SELECT * FROM attendance_audit WHERE attendance_id = $1 ORDER BY created_at',
      [id]
    );

    return {
      ...record,
      pauses,
      pause_minutes: Math.round(pauseMs(pauses, Date.now()) / 60000),
      worked_minutes: workedMinutes(record, pauses),
      audit,
    };
  });

  app.patch('/attendance/:id', {
    preHandler: [app.authenticate, app.requireAdmin],
  }, async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = CorrectionSchema.parse(request.body);

    const { rows } = await app.pg.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE id = $1',
      [id]
    );
    const record = rows[0];
    if (!record) throw notFound('Registro de asistencia no encontrado');

    const newCheckIn = body.check_in ? new Date(body.check_in) : new Date(record.check_in);
    const newCheckOut =
      body.check_out === undefined
        ? record.check_out
          ? new Date(record.check_out)
          : null
        : body.check_out === null
          ? null
          : new Date(body.check_out);

    if (newCheckOut && newCheckOut.getTime() < newCheckIn.getTime()) {
      throw conflict('La salida no puede ser anterior a la entrada');
    }

    const changes: Record<string, { old: unknown; new: unknown }> = {};
    if (
      body.check_in !== undefined &&
      new Date(record.check_in).getTime() !== newCheckIn.getTime()
    ) {
      changes.check_in = { old: record.check_in, new: newCheckIn.toISOString() };
    }
    if (body.check_out !== undefined) {
      const oldOut = record.check_out ? new Date(record.check_out).getTime() : null;
      const newOut = newCheckOut ? newCheckOut.getTime() : null;
      if (oldOut !== newOut) {
        changes.check_out = {
          old: record.check_out,
          new: newCheckOut ? newCheckOut.toISOString() : null,
        };
      }
    }
    if (Object.keys(changes).length === 0) {
      throw conflict('La corrección no cambia ningún valor');
    }

    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      await recordAudit(client, {
        attendanceId: id,
        actorId: request.currentUser.id,
        actorName: request.currentUser.name,
        action: 'correction',
        reason: body.reason,
        changes,
      });
      const { rows: updated } = await client.query<AttendanceRecord>(
        `UPDATE attendance SET check_in = $2, check_out = $3 WHERE id = $1 RETURNING *`,
        [id, newCheckIn.toISOString(), newCheckOut ? newCheckOut.toISOString() : null]
      );
      await client.query('COMMIT');
      return updated[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  // --- HU-02: registro olvidado (entrada manual) ---

  app.post('/attendance/manual', employeeOnly, async (request, reply) => {
    const body = ManualEntrySchema.parse(request.body);
    const { id: employeeId, name } = request.currentUser;
    const checkIn = new Date(body.check_in);
    const checkOut = body.check_out ? new Date(body.check_out) : null;
    const now = Date.now();

    if (checkIn.getTime() > now) {
      throw conflict('La hora de entrada no puede estar en el futuro');
    }
    if (checkOut && checkOut.getTime() > now) {
      throw conflict('La hora de salida no puede estar en el futuro');
    }

    const { rows: overlap } = await app.pg.query(
      `SELECT 1 FROM attendance
       WHERE employee_id = $1 AND status <> 'rejected'
       AND ($3::timestamptz IS NULL OR check_in < $3::timestamptz)
       AND (check_out IS NULL OR $2::timestamptz < check_out)`,
      [employeeId, checkIn.toISOString(), checkOut ? checkOut.toISOString() : null]
    );
    if (overlap.length > 0) {
      throw conflict('El registro se solapa con otro fichaje existente');
    }

    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<AttendanceRecord>(
        `INSERT INTO attendance (employee_id, employee_name, check_in, check_out, source, status)
         VALUES ($1, $2, $3, $4, 'manual', 'pending_validation')
         RETURNING *`,
        [employeeId, name, checkIn.toISOString(), checkOut ? checkOut.toISOString() : null]
      );
      const record = rows[0]!;
      await recordAudit(client, {
        attendanceId: record.id,
        actorId: employeeId,
        actorName: name,
        action: 'manual_create',
        reason: body.reason ?? 'Registro manual (fichaje olvidado)',
        changes: {
          check_in: { old: null, new: checkIn.toISOString() },
          check_out: { old: null, new: checkOut ? checkOut.toISOString() : null },
        },
      });
      await client.query('COMMIT');
      return reply.code(201).send(record);
    } catch (err) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(err)) {
        throw conflict('Ya tienes un fichaje abierto pendiente de cerrar');
      }
      throw err;
    } finally {
      client.release();
    }
  });

  app.post('/attendance/:id/validate', {
    preHandler: [app.authenticate, app.requireAdmin],
  }, async (request) => {
    const { id } = IdParams.parse(request.params);
    const body = ValidateSchema.parse(request.body);

    const { rows } = await app.pg.query<AttendanceRecord>(
      'SELECT * FROM attendance WHERE id = $1',
      [id]
    );
    const record = rows[0];
    if (!record) throw notFound('Registro de asistencia no encontrado');
    if (record.status !== 'pending_validation') {
      throw conflict('El registro no está pendiente de validación');
    }

    const newStatus = body.decision === 'approve' ? 'confirmed' : 'rejected';
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      await recordAudit(client, {
        attendanceId: id,
        actorId: request.currentUser.id,
        actorName: request.currentUser.name,
        action: 'manual_validate',
        reason:
          body.reason ??
          `Entrada manual ${body.decision === 'approve' ? 'aprobada' : 'rechazada'}`,
        changes: { status: { old: record.status, new: newStatus } },
      });
      const { rows: updated } = await client.query<AttendanceRecord>(
        'UPDATE attendance SET status = $2 WHERE id = $1 RETURNING *',
        [id, newStatus]
      );
      await client.query('COMMIT');
      return updated[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });

  app.post(
    '/attendance/:id/overtime/request',
    { preHandler: [app.authenticate] },
    async (request) => {
      const { id } = IdParams.parse(request.params);

      const { rows } = await app.pg.query<AttendanceRecord>(
        'SELECT * FROM attendance WHERE id = $1',
        [id]
      );
      const record = rows[0];
      if (!record) throw notFound('Registro de asistencia no encontrado');
      if (record.employee_id !== request.currentUser.id) {
        throw forbidden('Solo puedes solicitar horas extra sobre tu propio fichaje');
      }
      if (record.overtime_requested) {
        throw conflict('Las horas extra ya fueron solicitadas para este registro');
      }

      const { rows: updated } = await app.pg.query<AttendanceRecord>(
        'UPDATE attendance SET overtime_requested = true WHERE id = $1 RETURNING *',
        [id]
      );
      await app.pg.query(
        `INSERT INTO notifications (employee_id, employee_name, attendance_id, message, type)
         VALUES ($1, $2, $3, $4, 'overtime_request')`,
        [
          record.employee_id,
          record.employee_name,
          id,
          'Solicita autorización para trabajar horas extras',
        ]
      );
      return updated[0];
    }
  );

  app.post(
    '/attendance/:id/overtime/approve',
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request) => {
      const { id } = IdParams.parse(request.params);

      const { rows } = await app.pg.query<AttendanceRecord>(
        'SELECT * FROM attendance WHERE id = $1',
        [id]
      );
      const record = rows[0];
      if (!record) throw notFound('Registro de asistencia no encontrado');
      if (!record.overtime_requested) {
        throw conflict('El registro no tiene horas extra solicitadas');
      }

      const { rows: updated } = await app.pg.query<AttendanceRecord>(
        'UPDATE attendance SET overtime_approved = true WHERE id = $1 RETURNING *',
        [id]
      );
      await app.pg.query(
        `DELETE FROM notifications WHERE attendance_id = $1 AND type = 'overtime_request'`,
        [id]
      );
      return updated[0];
    }
  );
};
