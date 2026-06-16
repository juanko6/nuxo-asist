import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { conflict, forbidden, notFound, unauthorized } from '../lib/errors.js';
import type { AttendanceRecord } from '../types.js';

const PunchSchema = z.object({ code: z.string().regex(/^\d{4,8}$/) });

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';

export const kioskRoutes: FastifyPluginAsync = async (app) => {
  // El dispositivo-kiosco se autentica con un token propio (rol 'kiosk'),
  // distinto del de un empleado: no da acceso a ninguna otra ruta.
  const requireKiosk = async (request: FastifyRequest) => {
    let payload: { role?: string };
    try {
      payload = await request.jwtVerify<{ role?: string }>();
    } catch {
      throw unauthorized('Kiosco no autorizado');
    }
    if (payload.role !== 'kiosk') throw forbidden('Token no válido para el modo kiosco');
  };

  // El admin activa un dispositivo como kiosco y obtiene un token de larga duración.
  app.post('/kiosk/token', { preHandler: [app.authenticate, app.requireAdmin] }, async () => {
    return { token: app.jwt.sign({ role: 'kiosk' }, { expiresIn: '365d' }) };
  });

  // Fichaje por PIN/QR desde el kiosco: alterna entrada/salida del empleado.
  app.post('/kiosk/punch', { preHandler: [requireKiosk] }, async (request) => {
    const { code } = PunchSchema.parse(request.body);
    const tz = app.config.appTimezone;

    const { rows: emp } = await app.pg.query<{ id: string; name: string }>(
      `SELECT id, name FROM users WHERE pin_hash = $1 AND role = 'employee' AND status = 'active'`,
      [sha256(code)]
    );
    const employee = emp[0];
    if (!employee) throw notFound('PIN no reconocido');

    const { rows: open } = await app.pg.query<{ id: string }>(
      `SELECT id FROM attendance
       WHERE employee_id = $1 AND check_out IS NULL
       AND (check_in AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
      [employee.id, tz]
    );

    if (open[0]) {
      const { rows: paused } = await app.pg.query(
        `SELECT 1 FROM attendance_pauses WHERE attendance_id = $1 AND pause_end IS NULL`,
        [open[0].id]
      );
      if (paused[0]) throw conflict('Tienes una pausa abierta; reanúdala antes de salir');

      const { rows } = await app.pg.query<AttendanceRecord>(
        'UPDATE attendance SET check_out = now() WHERE id = $1 RETURNING *',
        [open[0].id]
      );
      return { action: 'check_out', employee_name: employee.name, time: rows[0]!.check_out };
    }

    try {
      const { rows } = await app.pg.query<AttendanceRecord>(
        `INSERT INTO attendance (employee_id, employee_name) VALUES ($1, $2) RETURNING *`,
        [employee.id, employee.name]
      );
      return { action: 'check_in', employee_name: employee.name, time: rows[0]!.check_in };
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict('Ya tienes un fichaje abierto');
      throw err;
    }
  });
};
