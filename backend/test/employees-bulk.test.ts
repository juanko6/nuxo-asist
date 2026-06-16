import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, insertUser, loginAs, resetDb } from './helpers.js';

describe('HU: alta masiva y cambio de contraseña en primer acceso', () => {
  let app: FastifyInstance;
  let adminToken: string;

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
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const bulk = (token: string, employees: unknown[]) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/employees/bulk',
      headers: auth(token),
      payload: { employees },
    });
  const login = (email: string, password: string) =>
    app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password } });

  describe('POST /api/v1/employees/bulk', () => {
    it('crea varios empleados; genera contraseña temporal si falta', async () => {
      const res = await bulk(adminToken, [
        { name: 'Ana Uno', email: 'ana@e.com', department: 'Ventas', position: 'Comercial' },
        { name: 'Beto Dos', email: 'beto@e.com', department: 'IT', position: 'Dev', password: 'clave-propia-1' },
      ]);

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.created).toHaveLength(2);
      expect(body.errors).toHaveLength(0);
      // a la primera no le dimos password -> temporal generada (>=8)
      expect(body.created[0].password.length).toBeGreaterThanOrEqual(8);

      // login con la temporal funciona y exige cambio de contraseña
      const l = await login('ana@e.com', body.created[0].password);
      expect(l.statusCode).toBe(200);
      expect(l.json().user.must_change_password).toBe(true);

      // y la que trajo password se respeta
      expect((await login('beto@e.com', 'clave-propia-1')).statusCode).toBe(200);
    });

    it('éxito parcial: reporta duplicados y filas inválidas, crea el resto', async () => {
      await insertUser(app, { email: 'existe@e.com', password: 'x'.repeat(8), role: 'employee' });

      const res = await bulk(adminToken, [
        { name: 'Nuevo OK', email: 'nuevo@e.com', department: 'D', position: 'P' },
        { name: 'Dup', email: 'existe@e.com', department: 'D', position: 'P' },
        { name: '', email: 'sin-nombre@e.com', department: 'D', position: 'P' },
        { name: 'Mal email', email: 'no-es-email', department: 'D', position: 'P' },
      ]);

      const body = res.json();
      expect(body.created).toHaveLength(1);
      expect(body.created[0].email).toBe('nuevo@e.com');
      expect(body.errors).toHaveLength(3);
    });

    it('un empleado no puede importar (403)', async () => {
      const emp = await createUserAndToken(app, {
        email: 'curro@e.com',
        password: 'clave-segura-1',
        role: 'employee',
      });
      const res = await bulk(emp.token, [
        { name: 'X', email: 'x@e.com', department: 'D', position: 'P' },
      ]);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/me/password', () => {
    async function importedEmployeeToken(email: string, tempPwd: string): Promise<string> {
      const res = await bulk(adminToken, [
        { name: 'Empleado', email, department: 'D', position: 'P', password: tempPwd },
      ]);
      expect(res.json().created).toHaveLength(1);
      return loginAs(app, email, tempPwd);
    }

    it('cambia la contraseña y limpia el flag de primer acceso', async () => {
      const token = await importedEmployeeToken('cambia@e.com', 'temporal-1');

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/me/password',
        headers: auth(token),
        payload: { current_password: 'temporal-1', new_password: 'nueva-clave-2' },
      });
      expect(res.statusCode).toBe(200);

      // la nueva funciona y ya no exige cambio
      const l = await login('cambia@e.com', 'nueva-clave-2');
      expect(l.statusCode).toBe(200);
      expect(l.json().user.must_change_password).toBe(false);

      // la temporal antigua ya no
      expect((await login('cambia@e.com', 'temporal-1')).statusCode).toBe(401);
    });

    it('rechaza si la contraseña actual no es correcta (400)', async () => {
      const token = await importedEmployeeToken('otro@e.com', 'temporal-1');
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/me/password',
        headers: auth(token),
        payload: { current_password: 'incorrecta', new_password: 'nueva-clave-2' },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
