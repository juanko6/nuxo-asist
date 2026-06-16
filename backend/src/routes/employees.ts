import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { SAFE_USER_COLUMNS } from '../app.js';
import type { SafeUser } from '../types.js';

const CreateEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  department: z.string().min(1),
  position: z.string().min(1),
});

const UpdateEmployeeSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    department: z.string().min(1).optional(),
    position: z.string().min(1).optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, {
    message: 'Debe incluir al menos un campo a actualizar',
  });

const IdParams = z.object({ id: z.string().uuid() });
const ListQuery = z.object({ status: z.enum(['active', 'inactive', 'all']).default('active') });

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

export const employeesRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, app.requireAdmin] };

  app.get('/employees', adminOnly, async (request) => {
    const { status } = ListQuery.parse(request.query);
    const filter = status === 'all' ? '' : ' AND status = $1';
    const values = status === 'all' ? [] : [status];
    const { rows } = await app.pg.query<SafeUser>(
      `SELECT ${SAFE_USER_COLUMNS} FROM users WHERE role = 'employee'${filter} ORDER BY name ASC`,
      values
    );
    return rows;
  });

  app.post('/employees', adminOnly, async (request, reply) => {
    const input = CreateEmployeeSchema.parse(request.body);
    const hash = await bcrypt.hash(input.password, app.config.bcryptRounds);
    try {
      const { rows } = await app.pg.query<SafeUser>(
        `INSERT INTO users (name, email, password_hash, role, department, position)
         VALUES ($1, $2, $3, 'employee', $4, $5)
         RETURNING ${SAFE_USER_COLUMNS}`,
        [input.name, input.email, hash, input.department, input.position]
      );
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict('Ya existe un usuario con ese email');
      }
      throw err;
    }
  });

  app.get('/employees/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = IdParams.parse(request.params);
    if (request.currentUser.role !== 'admin' && request.currentUser.id !== id) {
      throw forbidden();
    }
    const { rows } = await app.pg.query<SafeUser>(
      `SELECT ${SAFE_USER_COLUMNS} FROM users WHERE id = $1`,
      [id]
    );
    if (!rows[0]) throw notFound('Empleado no encontrado');
    return rows[0];
  });

  app.patch('/employees/:id', adminOnly, async (request) => {
    const { id } = IdParams.parse(request.params);
    const input = UpdateEmployeeSchema.parse(request.body);

    const assignments: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.name !== undefined) push('name', input.name);
    if (input.email !== undefined) push('email', input.email);
    if (input.department !== undefined) push('department', input.department);
    if (input.position !== undefined) push('position', input.position);
    if (input.password !== undefined) {
      push('password_hash', await bcrypt.hash(input.password, app.config.bcryptRounds));
    }

    values.push(id);
    try {
      const { rows } = await app.pg.query<SafeUser>(
        `UPDATE users SET ${assignments.join(', ')}
         WHERE id = $${values.length}
         RETURNING ${SAFE_USER_COLUMNS}`,
        values
      );
      if (!rows[0]) throw notFound('Empleado no encontrado');
      return rows[0];
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw conflict('Ya existe un usuario con ese email');
      }
      throw err;
    }
  });

  // Baja del empleado: NO se borra (la ley obliga a conservar registros 4+ años),
  // pasa a 'inactive'. Deja de poder acceder y de contar para las ausencias.
  app.post('/employees/:id/archive', adminOnly, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { rows } = await app.pg.query<SafeUser>(
      `UPDATE users SET status = 'inactive', archived_at = now()
       WHERE id = $1 AND role = 'employee'
       RETURNING ${SAFE_USER_COLUMNS}`,
      [id]
    );
    if (!rows[0]) throw notFound('Empleado no encontrado');
    return rows[0];
  });

  // Reactivar a un empleado dado de baja.
  app.post('/employees/:id/restore', adminOnly, async (request) => {
    const { id } = IdParams.parse(request.params);
    const { rows } = await app.pg.query<SafeUser>(
      `UPDATE users SET status = 'active', archived_at = NULL
       WHERE id = $1 AND role = 'employee'
       RETURNING ${SAFE_USER_COLUMNS}`,
      [id]
    );
    if (!rows[0]) throw notFound('Empleado no encontrado');
    return rows[0];
  });
};
