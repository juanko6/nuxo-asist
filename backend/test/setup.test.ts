import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, loginAs, resetDb } from './helpers.js';

describe('Onboarding: configuración inicial y branding', () => {
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

  const validSetup = {
    company_name: 'Mi Empresa SL',
    admin_name: 'Ana Jefa',
    admin_email: 'ana@miempresa.com',
    admin_password: 'clave-muy-segura',
  };

  const setup = (body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/v1/setup', payload: body });
  const status = () => app.inject({ method: 'GET', url: '/api/v1/setup/status' });

  describe('GET /setup/status', () => {
    it('en una instancia nueva pide configuración', async () => {
      const res = await status();
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ needs_setup: true, company_name: null });
    });

    it('tras configurar, ya no la pide', async () => {
      await setup(validSetup);
      const res = await status();
      expect(res.json().needs_setup).toBe(false);
      expect(res.json().company_name).toBe('Mi Empresa SL');
    });
  });

  describe('POST /setup', () => {
    it('crea la empresa y el administrador, que puede iniciar sesión', async () => {
      const res = await setup(validSetup);
      expect(res.statusCode).toBe(201);

      const token = await loginAs(app, validSetup.admin_email, validSetup.admin_password);
      expect(token).toBeTruthy();

      const me = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(me.json().role).toBe('admin');
    });

    it('no se puede ejecutar dos veces (409)', async () => {
      await setup(validSetup);
      const res = await setup({ ...validSetup, admin_email: 'otro@miempresa.com' });
      expect(res.statusCode).toBe(409);
    });

    it('valida nombre de empresa, email y contraseña (400)', async () => {
      expect((await setup({ ...validSetup, company_name: 'X' })).statusCode).toBe(400);
      expect((await setup({ ...validSetup, admin_email: 'no-es-email' })).statusCode).toBe(400);
      expect((await setup({ ...validSetup, admin_password: 'corta' })).statusCode).toBe(400);
    });
  });

  describe('GET/PUT /settings', () => {
    it('devuelve el nombre de empresa configurado', async () => {
      await setup(validSetup);
      const res = await app.inject({ method: 'GET', url: '/api/v1/settings' });
      expect(res.json().company_name).toBe('Mi Empresa SL');
    });

    it('el admin puede editar el nombre de empresa', async () => {
      await setup(validSetup);
      const token = await loginAs(app, validSetup.admin_email, validSetup.admin_password);

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/settings',
        headers: { authorization: `Bearer ${token}` },
        payload: { company_name: 'Nuevo Nombre SA' },
      });
      expect(res.statusCode).toBe(200);

      const check = await app.inject({ method: 'GET', url: '/api/v1/settings' });
      expect(check.json().company_name).toBe('Nuevo Nombre SA');
    });

    it('un empleado no puede editar los ajustes (403)', async () => {
      const { token } = await createUserAndToken(app, {
        email: 'empleado@miempresa.com',
        password: 'clave-empleado',
        role: 'employee',
      });
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/settings',
        headers: { authorization: `Bearer ${token}` },
        payload: { company_name: 'Hackeada' },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
