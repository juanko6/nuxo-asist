import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import type { Absence } from '../types.js';

const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: YYYY-MM-DD');

const CreateAbsenceSchema = z
  .object({
    employee_id: z.string().uuid(),
    type: z.enum(['vacation', 'sick_leave', 'leave', 'other']),
    start_date: DateOnly,
    end_date: DateOnly,
    reason: z.string().max(300).optional(),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: 'La fecha de fin no puede ser anterior a la de inicio',
  });

const ListQuerySchema = z.object({ employee_id: z.string().uuid().optional() });
const IdParams = z.object({ id: z.string().uuid() });

export const absencesRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, app.requireAdmin] };

  app.get('/absences', { preHandler: [app.authenticate] }, async (request) => {
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

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await app.pg.query<Absence>(
      `SELECT * FROM absences ${where} ORDER BY start_date DESC`,
      values
    );
    return rows;
  });

  app.post('/absences', adminOnly, async (request, reply) => {
    const input = CreateAbsenceSchema.parse(request.body);

    const { rows: emp } = await app.pg.query(
      `SELECT id FROM users WHERE id = $1 AND role = 'employee'`,
      [input.employee_id]
    );
    if (!emp[0]) throw notFound('Empleado no encontrado');

    const { rows } = await app.pg.query<Absence>(
      `INSERT INTO absences (employee_id, type, start_date, end_date, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.employee_id,
        input.type,
        input.start_date,
        input.end_date,
        input.reason ?? null,
        request.currentUser.id,
      ]
    );
    return reply.code(201).send(rows[0]);
  });

  app.delete('/absences/:id', adminOnly, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { rowCount } = await app.pg.query('DELETE FROM absences WHERE id = $1', [id]);
    if (rowCount === 0) throw notFound('Ausencia no encontrada');
    return reply.code(204).send();
  });
};
