import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';

describe('HU-05: horarios y cargas horarias', () => {
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
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  // L-V 09:00-17:00 => 5 días * 8h = 2400 min
  const fullTimeDays = [1, 2, 3, 4, 5].map((weekday) => ({
    weekday,
    start_time: '09:00',
    end_time: '17:00',
  }));

  const createTemplate = (token: string, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/schedule-templates',
      headers: auth(token),
      payload: body,
    });

  describe('Plantillas de horario', () => {
    it('el admin crea una plantilla y calcula la carga semanal', async () => {
      const res = await createTemplate(adminToken, {
        name: 'Jornada completa L-V',
        days: fullTimeDays,
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.weekly_minutes).toBe(2400);
      expect(body.days).toHaveLength(5);
    });

    it('un turno nocturno (22:00-06:00) cuenta 8h cruzando medianoche', async () => {
      const res = await createTemplate(adminToken, {
        name: 'Turno noche',
        days: [{ weekday: 1, start_time: '22:00', end_time: '06:00' }],
      });
      expect(res.json().weekly_minutes).toBe(480);
    });

    it('nombre duplicado: 409', async () => {
      await createTemplate(adminToken, { name: 'Repe', days: fullTimeDays });
      const res = await createTemplate(adminToken, { name: 'Repe', days: fullTimeDays });
      expect(res.statusCode).toBe(409);
    });

    it('sin días: 400', async () => {
      const res = await createTemplate(adminToken, { name: 'Vacía', days: [] });
      expect(res.statusCode).toBe(400);
    });

    it('un empleado no puede crear plantillas: 403', async () => {
      const res = await createTemplate(anaToken, { name: 'X', days: fullTimeDays });
      expect(res.statusCode).toBe(403);
    });

    it('lista las plantillas con su carga semanal', async () => {
      await createTemplate(adminToken, { name: 'Completa', days: fullTimeDays });
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/schedule-templates',
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toHaveLength(1);
      expect(body[0].weekly_minutes).toBe(2400);
    });

    it('detalle con días ordenados', async () => {
      const id = (await createTemplate(adminToken, { name: 'Completa', days: fullTimeDays })).json().id;
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/schedule-templates/${id}`,
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().days).toHaveLength(5);
    });

    it('plantilla inexistente: 404', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/schedule-templates/00000000-0000-0000-0000-000000000000',
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(404);
    });

    it('elimina una plantilla sin usar: 204', async () => {
      const id = (await createTemplate(adminToken, { name: 'Borrable', days: fullTimeDays })).json().id;
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/schedule-templates/${id}`,
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(204);
    });

    it('no elimina una plantilla asignada a un empleado: 409', async () => {
      const id = (await createTemplate(adminToken, { name: 'Asignada', days: fullTimeDays })).json().id;
      await app.inject({
        method: 'POST',
        url: `/api/v1/employees/${anaId}/schedule`,
        headers: auth(adminToken),
        payload: { template_id: id, valid_from: '2020-01-01' },
      });
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/schedule-templates/${id}`,
        headers: auth(adminToken),
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('Asignación por empleado', () => {
    let templateId: string;

    beforeEach(async () => {
      templateId = (await createTemplate(adminToken, { name: 'Completa', days: fullTimeDays }))
        .json()
        .id;
    });

    const assign = (employeeId: string, body: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/v1/employees/${employeeId}/schedule`,
        headers: auth(adminToken),
        payload: body,
      });

    it('asigna una plantilla y queda como activa con su carga semanal', async () => {
      const res = await assign(anaId, { template_id: templateId, valid_from: '2020-01-01' });
      expect(res.statusCode).toBe(201);

      const view = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/employees/${anaId}/schedule`,
          headers: auth(adminToken),
        })
      ).json();
      expect(view.active).not.toBeNull();
      expect(view.active.weekly_minutes).toBe(2400);
      expect(view.history).toHaveLength(1);
    });

    it('un cambio de horario cierra la vigencia anterior', async () => {
      await assign(anaId, { template_id: templateId, valid_from: '2020-01-01' });
      const media = (
        await createTemplate(adminToken, {
          name: 'Media jornada',
          days: [
            { weekday: 1, start_time: '09:00', end_time: '13:00' },
            { weekday: 3, start_time: '09:00', end_time: '13:00' },
            { weekday: 5, start_time: '09:00', end_time: '13:00' },
          ],
        })
      ).json().id;

      await assign(anaId, { template_id: media, valid_from: '2026-01-01' });

      const view = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/employees/${anaId}/schedule`,
          headers: auth(adminToken),
        })
      ).json();
      expect(view.history).toHaveLength(2);
      expect(view.active.template_id).toBe(media);
      expect(view.active.weekly_minutes).toBe(720); // 3 días * 4h
      const previous = view.history.find((h: { template_id: string }) => h.template_id === templateId);
      expect(previous.valid_to).toBe('2025-12-31');
    });

    it('rechaza una vigencia que no empieza después de la actual: 409', async () => {
      await assign(anaId, { template_id: templateId, valid_from: '2026-01-01' });
      const res = await assign(anaId, { template_id: templateId, valid_from: '2025-06-01' });
      expect(res.statusCode).toBe(409);
    });

    it('plantilla inexistente: 404', async () => {
      const res = await assign(anaId, {
        template_id: '00000000-0000-0000-0000-000000000000',
        valid_from: '2026-01-01',
      });
      expect(res.statusCode).toBe(404);
    });

    it('empleado inexistente: 404', async () => {
      const res = await assign('00000000-0000-0000-0000-000000000000', {
        template_id: templateId,
        valid_from: '2026-01-01',
      });
      expect(res.statusCode).toBe(404);
    });

    it('un empleado no puede asignar horarios: 403', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/employees/${anaId}/schedule`,
        headers: auth(anaToken),
        payload: { template_id: templateId, valid_from: '2026-01-01' },
      });
      expect(res.statusCode).toBe(403);
    });
  });
});
