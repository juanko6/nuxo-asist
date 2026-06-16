import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';

describe('Notifications y Login logs', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let anaToken: string;
  let anaId: string;

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
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  const createOvertimeNotification = async () => {
    const checkInRes = await app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-in',
      headers: auth(anaToken),
    });
    const record = checkInRes.json();
    await app.inject({
      method: 'POST',
      url: `/api/v1/attendance/${record.id}/overtime/request`,
      headers: auth(anaToken),
    });
  };

  describe('GET /api/v1/notifications', () => {
    it('el admin lista las notificaciones', async () => {
      await createOvertimeNotification();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: auth(adminToken),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        employee_id: anaId,
        employee_name: 'Ana López',
        type: 'overtime_request',
        read: false,
      });
      expect(body[0].attendance_id).toBeTypeOf('string');
    });

    it('un empleado recibe 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: auth(anaToken),
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('DELETE /api/v1/notifications/:id', () => {
    it('el admin elimina una notificación', async () => {
      await createOvertimeNotification();
      const { rows } = await app.pg.query<{ id: string }>('SELECT id FROM notifications');

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/notifications/${rows[0]!.id}`,
        headers: auth(adminToken),
      });

      expect(res.statusCode).toBe(204);
      const remaining = await app.pg.query('SELECT id FROM notifications');
      expect(remaining.rows).toHaveLength(0);
    });

    it('un empleado recibe 403', async () => {
      await createOvertimeNotification();
      const { rows } = await app.pg.query<{ id: string }>('SELECT id FROM notifications');

      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/notifications/${rows[0]!.id}`,
        headers: auth(anaToken),
      });
      expect(res.statusCode).toBe(403);
    });

    it('devuelve 404 con id inexistente', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/notifications/00000000-0000-0000-0000-000000000000',
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/login-logs', () => {
    it('el admin ve los logins de empleados (el login de Ana del setup)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/login-logs',
        headers: auth(adminToken),
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({ employee_id: anaId, employee_name: 'Ana López' });
    });

    it('filtra por fecha: una fecha pasada devuelve vacío', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/login-logs?date=2000-01-01',
        headers: auth(adminToken),
      });
      expect(res.json()).toHaveLength(0);
    });

    it('devuelve 400 con fecha inválida', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/login-logs?date=ayer',
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(400);
    });

    it('un empleado recibe 403', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/login-logs',
        headers: auth(anaToken),
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
