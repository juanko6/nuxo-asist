import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';
import { detectAbsences } from '../src/lib/absences.js';

describe('HU-01: ausencias', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let anaToken: string;
  let anaId: string;
  let carlosId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app);
    adminToken = (
      await createUserAndToken(app, {
        email: 'admin@empresa.com',
        password: 'clave-admin-123',
        name: 'Admin',
        role: 'admin',
      })
    ).token;
    const ana = await createUserAndToken(app, {
      email: 'ana@empresa.com',
      password: 'clave-segura-123',
      name: 'Ana López',
    });
    anaId = ana.id;
    anaToken = ana.token;
    carlosId = (
      await createUserAndToken(app, {
        email: 'carlos@empresa.com',
        password: 'clave-segura-456',
        name: 'Carlos Ruiz',
      })
    ).id;
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  describe('CRUD de ausencias', () => {
    const create = (token: string, body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/v1/absences', headers: auth(token), payload: body });

    it('el admin crea una ausencia: 201', async () => {
      const res = await create(adminToken, {
        employee_id: anaId,
        type: 'vacation',
        start_date: '2026-07-01',
        end_date: '2026-07-15',
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().type).toBe('vacation');
    });

    it('fecha de fin anterior a la de inicio: 400', async () => {
      const res = await create(adminToken, {
        employee_id: anaId,
        type: 'leave',
        start_date: '2026-07-15',
        end_date: '2026-07-01',
      });
      expect(res.statusCode).toBe(400);
    });

    it('empleado inexistente: 404', async () => {
      const res = await create(adminToken, {
        employee_id: '00000000-0000-0000-0000-000000000000',
        type: 'vacation',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      });
      expect(res.statusCode).toBe(404);
    });

    it('un empleado no puede crear ausencias: 403', async () => {
      const res = await create(anaToken, {
        employee_id: anaId,
        type: 'vacation',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      });
      expect(res.statusCode).toBe(403);
    });

    it('el empleado solo ve sus propias ausencias', async () => {
      await create(adminToken, {
        employee_id: anaId,
        type: 'vacation',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      });
      await create(adminToken, {
        employee_id: carlosId,
        type: 'sick_leave',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/absences',
        headers: auth(anaToken),
      });
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].employee_id).toBe(anaId);
    });

    it('el admin lista todas y puede filtrar por empleado', async () => {
      await create(adminToken, {
        employee_id: anaId,
        type: 'vacation',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      });
      await create(adminToken, {
        employee_id: carlosId,
        type: 'leave',
        start_date: '2026-07-01',
        end_date: '2026-07-02',
      });

      const all = (
        await app.inject({ method: 'GET', url: '/api/v1/absences', headers: auth(adminToken) })
      ).json();
      expect(all).toHaveLength(2);

      const filtered = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/absences?employee_id=${carlosId}`,
          headers: auth(adminToken),
        })
      ).json();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].employee_id).toBe(carlosId);
    });

    it('el admin elimina una ausencia: 204; inexistente: 404', async () => {
      const id = (
        await create(adminToken, {
          employee_id: anaId,
          type: 'vacation',
          start_date: '2026-07-01',
          end_date: '2026-07-02',
        })
      ).json().id;

      const del = await app.inject({
        method: 'DELETE',
        url: `/api/v1/absences/${id}`,
        headers: auth(adminToken),
      });
      expect(del.statusCode).toBe(204);

      const missing = await app.inject({
        method: 'DELETE',
        url: '/api/v1/absences/00000000-0000-0000-0000-000000000000',
        headers: auth(adminToken),
      });
      expect(missing.statusCode).toBe(404);
    });
  });

  describe('Detección de ausencias injustificadas', () => {
    // 2026-06-10 = miércoles (ISODOW 3); 2026-06-13 = sábado
    const WEDNESDAY = '2026-06-10';
    const SATURDAY = '2026-06-13';

    async function giveFullTimeSchedule(employeeId: string): Promise<void> {
      const { rows } = await app.pg.query<{ id: string }>(
        `INSERT INTO schedule_templates (name) VALUES ($1) RETURNING id`,
        [`Completa ${employeeId.slice(0, 8)}`]
      );
      const templateId = rows[0]!.id;
      for (const weekday of [1, 2, 3, 4, 5]) {
        await app.pg.query(
          `INSERT INTO schedule_template_days (template_id, weekday, start_time, end_time)
           VALUES ($1, $2, '09:00', '17:00')`,
          [templateId, weekday]
        );
      }
      await app.pg.query(
        `INSERT INTO employee_schedules (employee_id, template_id, valid_from)
         VALUES ($1, $2, '2020-01-01')`,
        [employeeId, templateId]
      );
    }

    const notifCount = async (employeeId: string) => {
      const { rows } = await app.pg.query(
        `SELECT id FROM notifications WHERE employee_id = $1 AND type = 'absence'`,
        [employeeId]
      );
      return rows.length;
    };

    it('marca a un empleado con día laborable, sin fichaje y sin ausencia', async () => {
      await giveFullTimeSchedule(anaId);

      const flagged = await detectAbsences(app.pg, { timezone: 'UTC' }, WEDNESDAY);

      expect(flagged.map((f) => f.employee_id)).toContain(anaId);
      expect(await notifCount(anaId)).toBe(1);
    });

    it('no marca si el empleado fichó ese día', async () => {
      await giveFullTimeSchedule(anaId);
      await app.pg.query(
        `INSERT INTO attendance (employee_id, employee_name, check_in)
         VALUES ($1, 'Ana López', $2)`,
        [anaId, `${WEDNESDAY}T08:00:00.000Z`]
      );

      const flagged = await detectAbsences(app.pg, { timezone: 'UTC' }, WEDNESDAY);
      expect(flagged.map((f) => f.employee_id)).not.toContain(anaId);
    });

    it('no marca si hay una ausencia registrada que cubre el día', async () => {
      await giveFullTimeSchedule(anaId);
      await app.pg.query(
        `INSERT INTO absences (employee_id, type, start_date, end_date)
         VALUES ($1, 'vacation', $2, $3)`,
        [anaId, '2026-06-08', '2026-06-12']
      );

      const flagged = await detectAbsences(app.pg, { timezone: 'UTC' }, WEDNESDAY);
      expect(flagged.map((f) => f.employee_id)).not.toContain(anaId);
    });

    it('no marca en un día no laborable según el horario (sábado)', async () => {
      await giveFullTimeSchedule(anaId);
      const flagged = await detectAbsences(app.pg, { timezone: 'UTC' }, SATURDAY);
      expect(flagged).toHaveLength(0);
    });

    it('no marca a un empleado sin horario asignado', async () => {
      const flagged = await detectAbsences(app.pg, { timezone: 'UTC' }, WEDNESDAY);
      expect(flagged).toHaveLength(0);
    });

    it('es idempotente: no repite el aviso en una segunda pasada', async () => {
      await giveFullTimeSchedule(anaId);

      await detectAbsences(app.pg, { timezone: 'UTC' }, WEDNESDAY);
      const second = await detectAbsences(app.pg, { timezone: 'UTC' }, WEDNESDAY);

      expect(second).toHaveLength(0);
      expect(await notifCount(anaId)).toBe(1);
    });
  });
});
