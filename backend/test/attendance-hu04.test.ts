import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';

describe('HU-04: pausas, auditoría y export', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let anaToken: string;
  let anaId: string;
  let carlosToken: string;

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
    carlosToken = (
      await createUserAndToken(app, {
        email: 'carlos@empresa.com',
        password: 'clave-segura-456',
        name: 'Carlos Ruiz',
      })
    ).token;
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const checkIn = (token: string) =>
    app.inject({ method: 'POST', url: '/api/v1/attendance/check-in', headers: auth(token) });
  const checkOut = (token: string) =>
    app.inject({ method: 'POST', url: '/api/v1/attendance/check-out', headers: auth(token) });
  const pauseStart = (token: string, body?: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/attendance/pause/start',
      headers: auth(token),
      payload: body ?? {},
    });
  const pauseEnd = (token: string) =>
    app.inject({ method: 'POST', url: '/api/v1/attendance/pause/end', headers: auth(token) });

  /** Inserta un registro cerrado con tiempos conocidos (para asserts deterministas). */
  async function seedAttendance(checkInIso: string, checkOutIso: string | null): Promise<string> {
    const { rows } = await app.pg.query<{ id: string }>(
      `INSERT INTO attendance (employee_id, employee_name, check_in, check_out)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [anaId, 'Ana López', checkInIso, checkOutIso]
    );
    return rows[0]!.id;
  }
  async function seedPause(attendanceId: string, startIso: string, endIso: string): Promise<void> {
    await app.pg.query(
      `INSERT INTO attendance_pauses (attendance_id, pause_start, pause_end)
       VALUES ($1, $2, $3)`,
      [attendanceId, startIso, endIso]
    );
  }

  describe('Pausas', () => {
    it('inicia una pausa sobre la jornada abierta', async () => {
      await checkIn(anaToken);
      const res = await pauseStart(anaToken, { reason: 'comida' });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.pause_end).toBeNull();
      expect(body.reason).toBe('comida');
    });

    it('no se puede pausar sin jornada abierta: 409', async () => {
      const res = await pauseStart(anaToken);
      expect(res.statusCode).toBe(409);
    });

    it('dos pausas abiertas a la vez: 409', async () => {
      await checkIn(anaToken);
      await pauseStart(anaToken);
      const res = await pauseStart(anaToken);
      expect(res.statusCode).toBe(409);
    });

    it('reanuda la pausa abierta y fija pause_end', async () => {
      await checkIn(anaToken);
      await pauseStart(anaToken);
      const res = await pauseEnd(anaToken);

      expect(res.statusCode).toBe(200);
      expect(res.json().pause_end).not.toBeNull();
    });

    it('reanudar sin pausa abierta: 409', async () => {
      await checkIn(anaToken);
      const res = await pauseEnd(anaToken);
      expect(res.statusCode).toBe(409);
    });

    it('no se puede fichar salida con una pausa abierta: 409', async () => {
      await checkIn(anaToken);
      await pauseStart(anaToken);
      const res = await checkOut(anaToken);
      expect(res.statusCode).toBe(409);
    });

    it('tras reanudar, el check-out funciona', async () => {
      await checkIn(anaToken);
      await pauseStart(anaToken);
      await pauseEnd(anaToken);
      const res = await checkOut(anaToken);
      expect(res.statusCode).toBe(200);
    });

    it('un admin no puede pausar: 403', async () => {
      const res = await pauseStart(adminToken);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('GET /api/v1/attendance/:id (detalle)', () => {
    it('descuenta las pausas del tiempo trabajado', async () => {
      // 8h de jornada con 30 min de pausa => 450 min trabajados
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T16:00:00.000Z');
      await seedPause(id, '2026-06-10T12:00:00.000Z', '2026-06-10T12:30:00.000Z');

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/attendance/${id}`,
        headers: auth(anaToken),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.pauses).toHaveLength(1);
      expect(body.pause_minutes).toBe(30);
      expect(body.worked_minutes).toBe(450);
    });

    it('worked_minutes es null si la jornada sigue abierta', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', null);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/attendance/${id}`,
        headers: auth(anaToken),
      });
      expect(res.json().worked_minutes).toBeNull();
    });

    it('un empleado no puede ver el registro de otro: 403', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T16:00:00.000Z');
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/attendance/${id}`,
        headers: auth(carlosToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it('el admin ve cualquier registro: 200', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T16:00:00.000Z');
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/attendance/${id}`,
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
    });

    it('registro inexistente: 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/attendance/00000000-0000-0000-0000-000000000000',
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PATCH /api/v1/attendance/:id (corrección con traza)', () => {
    it('corrige check_out, conserva el original en auditoría y exige motivo', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T15:00:00.000Z');

      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/attendance/${id}`,
        headers: auth(adminToken),
        payload: { check_out: '2026-06-10T17:00:00.000Z', reason: 'olvido de fichar salida' },
      });

      expect(res.statusCode).toBe(200);
      expect(new Date(res.json().check_out).toISOString()).toBe('2026-06-10T17:00:00.000Z');

      const detail = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/attendance/${id}`,
          headers: auth(adminToken),
        })
      ).json();
      expect(detail.audit).toHaveLength(1);
      expect(detail.audit[0]).toMatchObject({
        action: 'correction',
        reason: 'olvido de fichar salida',
        actor_name: 'Admin',
      });
      expect(new Date(detail.audit[0].changes.check_out.old).toISOString()).toBe(
        '2026-06-10T15:00:00.000Z'
      );
    });

    it('sin motivo: 400', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T15:00:00.000Z');
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/attendance/${id}`,
        headers: auth(adminToken),
        payload: { check_out: '2026-06-10T17:00:00.000Z' },
      });
      expect(res.statusCode).toBe(400);
    });

    it('un empleado no puede corregir: 403', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T15:00:00.000Z');
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/attendance/${id}`,
        headers: auth(anaToken),
        payload: { check_out: '2026-06-10T17:00:00.000Z', reason: 'test' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('salida anterior a la entrada: 409', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T15:00:00.000Z');
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/attendance/${id}`,
        headers: auth(adminToken),
        payload: { check_out: '2026-06-10T07:00:00.000Z', reason: 'error' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('registro inexistente: 404', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/attendance/00000000-0000-0000-0000-000000000000',
        headers: auth(adminToken),
        payload: { check_out: '2026-06-10T17:00:00.000Z', reason: 'motivo' },
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/attendance/export.csv', () => {
    it('el admin exporta CSV con cabecera y minutos trabajados', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T16:00:00.000Z');
      await seedPause(id, '2026-06-10T12:00:00.000Z', '2026-06-10T12:30:00.000Z');

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/attendance/export.csv',
        headers: auth(adminToken),
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const lines = res.body.trim().split('\r\n');
      expect(lines[0]).toBe(
        'employee_id,employee_name,date,check_in,check_out,pause_minutes,worked_minutes,overtime_approved,corrected'
      );
      expect(lines[1]).toContain('Ana López');
      expect(lines[1]).toContain('2026-06-10');
      expect(lines[1]).toContain(',30,450,');
    });

    it('un empleado no puede exportar: 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/attendance/export.csv',
        headers: auth(anaToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it('marca corrected=si cuando el registro fue corregido', async () => {
      const id = await seedAttendance('2026-06-10T08:00:00.000Z', '2026-06-10T15:00:00.000Z');
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/attendance/${id}`,
        headers: auth(adminToken),
        payload: { check_out: '2026-06-10T16:00:00.000Z', reason: 'ajuste' },
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/attendance/export.csv',
        headers: auth(adminToken),
      });
      const dataLine = res.body.trim().split('\r\n')[1]!;
      expect(dataLine.endsWith(',si')).toBe(true);
    });
  });
});
