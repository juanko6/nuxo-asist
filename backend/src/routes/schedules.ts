import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { conflict, notFound } from '../lib/errors.js';
import type {
  ScheduleTemplate,
  ScheduleTemplateDay,
  EmployeeSchedule,
} from '../types.js';

const TimeStr = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Hora esperada: HH:MM');

const DaySchema = z.object({
  weekday: z.number().int().min(1).max(7),
  start_time: TimeStr,
  end_time: TimeStr,
});

const CreateTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  days: z.array(DaySchema).min(1, 'Indica al menos un día con horario'),
});

const AssignSchema = z.object({
  template_id: z.string().uuid(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD'),
});

const IdParams = z.object({ id: z.string().uuid() });

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
const isForeignKeyViolation = (err: unknown): boolean => {
  // 23503 = foreign_key_violation (PG ≤17); 23001 = restrict_violation, que es
  // como PostgreSQL 18 reporta una violación de FK con ON DELETE RESTRICT.
  const code = typeof err === 'object' && err !== null ? (err as { code?: string }).code : undefined;
  return code === '23503' || code === '23001';
};

/** Minutos de un bloque; si end <= start cruza medianoche (turno nocturno). */
const blockMinutes = (start: string, end: string): number => {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h! * 60 + m!;
  };
  const diff = toMin(end) - toMin(start);
  return diff <= 0 ? diff + 1440 : diff;
};

const weeklyMinutes = (days: Pick<ScheduleTemplateDay, 'start_time' | 'end_time'>[]): number =>
  days.reduce((sum, d) => sum + blockMinutes(d.start_time, d.end_time), 0);

export const schedulesRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, app.requireAdmin] };

  // --- Plantillas de horario ---

  app.get('/schedule-templates', adminOnly, async () => {
    const { rows: templates } = await app.pg.query<ScheduleTemplate>(
      'SELECT * FROM schedule_templates ORDER BY name ASC'
    );
    const { rows: days } = await app.pg.query<ScheduleTemplateDay>(
      'SELECT * FROM schedule_template_days'
    );
    return templates.map((t) => ({
      ...t,
      weekly_minutes: weeklyMinutes(days.filter((d) => d.template_id === t.id)),
    }));
  });

  app.post('/schedule-templates', adminOnly, async (request, reply) => {
    const input = CreateTemplateSchema.parse(request.body);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<ScheduleTemplate>(
        `INSERT INTO schedule_templates (name, description)
         VALUES ($1, $2) RETURNING *`,
        [input.name, input.description ?? null]
      );
      const template = rows[0]!;
      for (const d of input.days) {
        await client.query(
          `INSERT INTO schedule_template_days (template_id, weekday, start_time, end_time)
           VALUES ($1, $2, $3, $4)`,
          [template.id, d.weekday, d.start_time, d.end_time]
        );
      }
      await client.query('COMMIT');
      return reply.code(201).send({
        ...template,
        days: input.days,
        weekly_minutes: weeklyMinutes(input.days),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(err)) {
        throw conflict('Ya existe una plantilla con ese nombre');
      }
      throw err;
    } finally {
      client.release();
    }
  });

  app.get('/schedule-templates/:id', adminOnly, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { rows } = await app.pg.query<ScheduleTemplate>(
      'SELECT * FROM schedule_templates WHERE id = $1',
      [id]
    );
    const template = rows[0];
    if (!template) throw notFound('Plantilla no encontrada');
    const { rows: days } = await app.pg.query<ScheduleTemplateDay>(
      'SELECT * FROM schedule_template_days WHERE template_id = $1 ORDER BY weekday, start_time',
      [id]
    );
    return { ...template, days, weekly_minutes: weeklyMinutes(days) };
  });

  app.delete('/schedule-templates/:id', adminOnly, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    try {
      const { rowCount } = await app.pg.query('DELETE FROM schedule_templates WHERE id = $1', [id]);
      if (rowCount === 0) throw notFound('Plantilla no encontrada');
      return reply.code(204).send();
    } catch (err) {
      if (isForeignKeyViolation(err)) {
        throw conflict('La plantilla está asignada a algún empleado y no puede eliminarse');
      }
      throw err;
    }
  });

  // --- Asignación de horario por empleado (con vigencias) ---

  const activeScheduleFor = async (employeeId: string) => {
    const { rows: active } = await app.pg.query(
      `SELECT es.*, t.name AS template_name
       FROM employee_schedules es
       JOIN schedule_templates t ON t.id = es.template_id
       WHERE es.employee_id = $1
       AND es.valid_from <= $2::date
       AND (es.valid_to IS NULL OR es.valid_to >= $2::date)
       LIMIT 1`,
      [employeeId, todayIso()]
    );
    if (!active[0]) return null;
    const { rows: days } = await app.pg.query<ScheduleTemplateDay>(
      'SELECT * FROM schedule_template_days WHERE template_id = $1 ORDER BY weekday, start_time',
      [active[0].template_id]
    );
    return { ...active[0], days, weekly_minutes: weeklyMinutes(days) };
  };

  // El empleado consulta su propio horario activo (para la barra de progreso)
  app.get('/me/schedule', { preHandler: [app.authenticate] }, async (request) => {
    return { active: await activeScheduleFor(request.currentUser.id) };
  });

  app.get('/employees/:id/schedule', adminOnly, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { rows: history } = await app.pg.query(
      `SELECT es.*, t.name AS template_name
       FROM employee_schedules es
       JOIN schedule_templates t ON t.id = es.template_id
       WHERE es.employee_id = $1
       ORDER BY es.valid_from DESC`,
      [id]
    );
    return { active: await activeScheduleFor(id), history };
  });

  app.post('/employees/:id/schedule', adminOnly, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const body = AssignSchema.parse(request.body);

    const { rows: emp } = await app.pg.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'employee'`,
      [id]
    );
    if (!emp[0]) throw notFound('Empleado no encontrado');
    const { rows: tpl } = await app.pg.query('SELECT id FROM schedule_templates WHERE id = $1', [
      body.template_id,
    ]);
    if (!tpl[0]) throw notFound('Plantilla no encontrada');

    const { rows: open } = await app.pg.query<{ id: string; valid_from: string }>(
      'SELECT id, valid_from FROM employee_schedules WHERE employee_id = $1 AND valid_to IS NULL',
      [id]
    );
    if (open[0] && open[0].valid_from >= body.valid_from) {
      throw conflict('La nueva vigencia debe empezar después de la asignación actual');
    }

    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      if (open[0]) {
        await client.query(
          `UPDATE employee_schedules SET valid_to = ($1::date - 1) WHERE id = $2`,
          [body.valid_from, open[0].id]
        );
      }
      const { rows: inserted } = await client.query<EmployeeSchedule>(
        `INSERT INTO employee_schedules (employee_id, template_id, valid_from)
         VALUES ($1, $2, $3) RETURNING *`,
        [id, body.template_id, body.valid_from]
      );
      await client.query('COMMIT');
      return reply.code(201).send(inserted[0]);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  });
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);
