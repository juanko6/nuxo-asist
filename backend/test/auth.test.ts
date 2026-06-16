import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, insertUser, resetDb } from './helpers.js';

describe('Auth', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app);
  });

  describe('POST /api/v1/auth/login', () => {
    it('devuelve token y usuario (sin contraseña) con credenciales válidas', async () => {
      await insertUser(app, {
        email: 'ana@empresa.com',
        password: 'clave-segura-123',
        name: 'Ana López',
        role: 'employee',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'ana@empresa.com', password: 'clave-segura-123' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.token).toBeTypeOf('string');
      expect(body.token.length).toBeGreaterThan(20);
      expect(body.user).toMatchObject({
        email: 'ana@empresa.com',
        name: 'Ana López',
        role: 'employee',
      });
      expect(body.user.password).toBeUndefined();
      expect(body.user.password_hash).toBeUndefined();
    });

    it('registra un login_log cuando entra un empleado', async () => {
      const id = await insertUser(app, {
        email: 'ana@empresa.com',
        password: 'clave-segura-123',
        name: 'Ana López',
        role: 'employee',
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'ana@empresa.com', password: 'clave-segura-123' },
      });

      const { rows } = await app.pg.query(
        'SELECT employee_id, employee_name FROM login_logs'
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ employee_id: id, employee_name: 'Ana López' });
    });

    it('NO registra login_log cuando entra un admin', async () => {
      await insertUser(app, {
        email: 'admin@empresa.com',
        password: 'clave-admin-123',
        role: 'admin',
      });

      await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'admin@empresa.com', password: 'clave-admin-123' },
      });

      const { rows } = await app.pg.query('SELECT id FROM login_logs');
      expect(rows).toHaveLength(0);
    });

    it('acepta el email sin distinguir mayúsculas', async () => {
      await insertUser(app, { email: 'ana@empresa.com', password: 'clave-segura-123' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'ANA@Empresa.COM', password: 'clave-segura-123' },
      });

      expect(res.statusCode).toBe(200);
    });

    it('devuelve 401 con contraseña incorrecta', async () => {
      await insertUser(app, { email: 'ana@empresa.com', password: 'clave-segura-123' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'ana@empresa.com', password: 'incorrecta' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('devuelve 401 con email inexistente (mismo error que contraseña mala)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nadie@empresa.com', password: 'lo-que-sea' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('devuelve 400 si falta la contraseña', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'ana@empresa.com' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('devuelve el usuario del token', async () => {
      await insertUser(app, {
        email: 'ana@empresa.com',
        password: 'clave-segura-123',
        name: 'Ana López',
      });
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'ana@empresa.com', password: 'clave-segura-123' },
      });
      const token = login.json().token;

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ email: 'ana@empresa.com', name: 'Ana López' });
      expect(res.json().password_hash).toBeUndefined();
    });

    it('devuelve 401 sin token', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe('UNAUTHORIZED');
    });

    it('devuelve 401 con token corrupto', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: 'Bearer no-es-un-jwt' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('devuelve 401 si el usuario del token ya no existe', async () => {
      const id = await insertUser(app, {
        email: 'ana@empresa.com',
        password: 'clave-segura-123',
      });
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'ana@empresa.com', password: 'clave-segura-123' },
      });
      const token = login.json().token;

      await app.pg.query('DELETE FROM users WHERE id = $1', [id]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
