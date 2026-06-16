import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';

describe('HU-08: modo kiosco (PIN)', () => {
  let app: FastifyInstance;
  let adminToken: string;
  let employeeToken: string;
  let anaId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app);
    adminToken = (
      await createUserAndToken(app, { email: 'admin@empresa.com', password: 'clave-admin-123', name: 'Admin', role: 'admin' })
    ).token;
    const ana = await createUserAndToken(app, { email: 'ana@empresa.com', password: 'clave-segura-123', name: 'Ana' });
    anaId = ana.id;
    employeeToken = ana.token;
  });

  const auth = (t: string) => ({ authorization: `Bearer ${t}` });
  const setPin = (id: string, pin: string | null, token = adminToken) =>
    app.inject({ method: 'PUT', url: `/api/v1/employees/${id}/pin`, headers: auth(token), payload: { pin } });
  const kioskToken = async () =>
    (await app.inject({ method: 'POST', url: '/api/v1/kiosk/token', headers: auth(adminToken) })).json().token as string;
  const punch = (token: string | null, code: string) =>
    app.inject({ method: 'POST', url: '/api/v1/kiosk/punch', headers: token ? auth(token) : {}, payload: { code } });

  describe('Token de kiosco', () => {
    it('el admin obtiene un token; el empleado no (403) y sin auth 401', async () => {
      expect((await app.inject({ method: 'POST', url: '/api/v1/kiosk/token', headers: auth(adminToken) })).statusCode).toBe(200);
      expect((await app.inject({ method: 'POST', url: '/api/v1/kiosk/token', headers: auth(employeeToken) })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url: '/api/v1/kiosk/token' })).statusCode).toBe(401);
    });
  });

  describe('PIN del empleado', () => {
    it('el admin asigna un PIN (has_pin=true)', async () => {
      const res = await setPin(anaId, '1234');
      expect(res.statusCode).toBe(200);
      expect(res.json().has_pin).toBe(true);
    });
    it('rechaza formato inválido (400)', async () => {
      expect((await setPin(anaId, 'abc')).statusCode).toBe(400);
    });
    it('rechaza PIN duplicado (409)', async () => {
      await setPin(anaId, '1234');
      const beto = await createUserAndToken(app, { email: 'beto@empresa.com', password: 'clave-segura-1', name: 'Beto' });
      expect((await setPin(beto.id, '1234')).statusCode).toBe(409);
    });
  });

  describe('Fichaje en kiosco', () => {
    it('alterna entrada y salida con el PIN', async () => {
      await setPin(anaId, '1234');
      const kt = await kioskToken();

      const inRes = await punch(kt, '1234');
      expect(inRes.statusCode).toBe(200);
      expect(inRes.json().action).toBe('check_in');
      expect(inRes.json().employee_name).toBe('Ana');

      const outRes = await punch(kt, '1234');
      expect(outRes.json().action).toBe('check_out');
    });

    it('PIN desconocido: 404', async () => {
      const kt = await kioskToken();
      expect((await punch(kt, '9999')).statusCode).toBe(404);
    });

    it('sin token de kiosco: 401; con token de empleado: 403', async () => {
      await setPin(anaId, '1234');
      expect((await punch(null, '1234')).statusCode).toBe(401);
      expect((await punch(employeeToken, '1234')).statusCode).toBe(403);
    });
  });
});
