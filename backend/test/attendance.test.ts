import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';

describe('Attendance', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let anaToken: string;
  let anaId: string;
  let carlosToken: string;
  let carlosId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app);
    const admin = await createUserAndToken(app, {
      email: 'admin@empresa.com',
      password: 'clave-admin-123',
      name: 'Admin',
      role: 'admin',
    });
    adminToken = admin.token;
    const ana = await createUserAndToken(app, {
      email: 'ana@empresa.com',
      password: 'clave-segura-123',
      name: 'Ana López',
    });
    anaId = ana.id;
    anaToken = ana.token;
    const carlos = await createUserAndToken(app, {
      email: 'carlos@empresa.com',
      password: 'clave-segura-456',
      name: 'Carlos Ruiz',
    });
    carlosId = carlos.id;
    carlosToken = carlos.token;
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const checkIn = (token: string) =>
    app.inject({ method: 'POST', url: '/api/v1/attendance/check-in', headers: auth(token) });

  const checkOut = (token: string) =>
    app.inject({ method: 'POST', url: '/api/v1/attendance/check-out', headers: auth(token) });

  describe('POST /api/v1/attendance/check-in', () => {
    it('crea el registro del día con hora del servidor y nombre del empleado', async () => {
      const res = await checkIn(anaToken);

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.employee_id).toBe(anaId);
      expect(body.employee_name).toBe('Ana López');
      expect(body.check_out).toBeNull();
      expect(body.overtime_requested).toBe(false);
      const checkInTime = new Date(body.check_in).getTime();
      expect(Math.abs(Date.now() - checkInTime)).toBeLessThan(10_000);
    });

    it('rechaza un segundo fichaje el mismo día con 409', async () => {
      await checkIn(anaToken);
      const res = await checkIn(anaToken);

      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe('CONFLICT');
    });

    it('un admin no ficha: 403', async () => {
      const res = await checkIn(adminToken);
      expect(res.statusCode).toBe(403);
    });

    it('sin token: 401', async () => {
      const res = await app.inject({ method: 'POST', url: '/api/v1/attendance/check-in' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /api/v1/attendance/check-out', () => {
    it('cierra el registro abierto de hoy con hora del servidor', async () => {
      await checkIn(anaToken);
      const res = await checkOut(anaToken);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.check_out).not.toBeNull();
      expect(new Date(body.check_out).getTime()).toBeGreaterThanOrEqual(
        new Date(body.check_in).getTime()
      );
    });

    it('sin registro abierto devuelve 409', async () => {
      const res = await checkOut(anaToken);
      expect(res.statusCode).toBe(409);
    });

    it('tras cerrar, un segundo check-out devuelve 409', async () => {
      await checkIn(anaToken);
      await checkOut(anaToken);
      const res = await checkOut(anaToken);
      expect(res.statusCode).toBe(409);
    });
  });

  describe('GET /api/v1/attendance', () => {
    it('un empleado solo ve sus propios registros', async () => {
      await checkIn(anaToken);
      await checkIn(carlosToken);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/attendance',
        headers: auth(anaToken),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].employee_id).toBe(anaId);
    });

    it('un empleado no puede ver los de otro aunque pase employee_id', async () => {
      await checkIn(anaToken);
      await checkIn(carlosToken);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/attendance?employee_id=${carlosId}`,
        headers: auth(anaToken),
      });

      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].employee_id).toBe(anaId);
    });

    it('el admin ve todos los registros', async () => {
      await checkIn(anaToken);
      await checkIn(carlosToken);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/attendance',
        headers: auth(adminToken),
      });

      expect(res.json()).toHaveLength(2);
    });

    it('el admin puede filtrar por empleado', async () => {
      await checkIn(anaToken);
      await checkIn(carlosToken);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/attendance?employee_id=${carlosId}`,
        headers: auth(adminToken),
      });

      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].employee_id).toBe(carlosId);
    });

    it('filtra por fecha: una fecha pasada no incluye los fichajes de hoy', async () => {
      await checkIn(anaToken);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/attendance?date=2000-01-01',
        headers: auth(adminToken),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(0);
    });

    it('devuelve 400 con fecha inválida', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/attendance?date=ayer',
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/attendance/:id/overtime/request', () => {
    it('marca la solicitud y crea una notificación ligada al registro', async () => {
      const record = (await checkIn(anaToken)).json();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/request`,
        headers: auth(anaToken),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().overtime_requested).toBe(true);

      const { rows } = await app.pg.query(
        'SELECT employee_id, attendance_id, type FROM notifications'
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        employee_id: anaId,
        attendance_id: record.id,
        type: 'overtime_request',
      });
    });

    it('no se puede solicitar sobre el registro de otro: 403', async () => {
      const record = (await checkIn(anaToken)).json();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/request`,
        headers: auth(carlosToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it('solicitar dos veces devuelve 409', async () => {
      const record = (await checkIn(anaToken)).json();
      await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/request`,
        headers: auth(anaToken),
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/request`,
        headers: auth(anaToken),
      });
      expect(res.statusCode).toBe(409);
    });

    it('registro inexistente devuelve 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/attendance/00000000-0000-0000-0000-000000000000/overtime/request',
        headers: auth(anaToken),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/attendance/:id/overtime/approve', () => {
    it('el admin aprueba y se eliminan las notificaciones de solicitud', async () => {
      const record = (await checkIn(anaToken)).json();
      await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/request`,
        headers: auth(anaToken),
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/approve`,
        headers: auth(adminToken),
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().overtime_approved).toBe(true);

      const { rows } = await app.pg.query('SELECT id FROM notifications');
      expect(rows).toHaveLength(0);
    });

    it('un empleado no puede aprobar: 403', async () => {
      const record = (await checkIn(anaToken)).json();
      await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/request`,
        headers: auth(anaToken),
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/approve`,
        headers: auth(anaToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it('aprobar sin solicitud previa devuelve 409', async () => {
      const record = (await checkIn(anaToken)).json();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${record.id}/overtime/approve`,
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(409);
    });

    it('registro inexistente devuelve 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/attendance/00000000-0000-0000-0000-000000000000/overtime/approve',
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
