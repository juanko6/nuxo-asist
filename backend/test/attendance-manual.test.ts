import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';

describe('HU-02: registro olvidado (entrada manual)', () => {
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
  const future = (ms: number) => new Date(Date.now() + ms).toISOString();

  const manual = (token: string, body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/attendance/manual',
      headers: auth(token),
      payload: body,
    });

  async function seedConfirmed(checkInIso: string, checkOutIso: string | null): Promise<string> {
    const { rows } = await app.pg.query<{ id: string }>(
      `INSERT INTO attendance (employee_id, employee_name, check_in, check_out)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [anaId, 'Ana López', checkInIso, checkOutIso]
    );
    return rows[0]!.id;
  }

  describe('POST /api/v1/attendance/manual', () => {
    it('crea una entrada manual pendiente de validación con huella de auditoría', async () => {
      const res = await manual(anaToken, {
        check_in: '2026-06-13T08:00:00.000Z',
        check_out: '2026-06-13T16:00:00.000Z',
        reason: 'olvidé fichar al llegar',
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.source).toBe('manual');
      expect(body.status).toBe('pending_validation');

      const detail = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/attendance/${body.id}`,
          headers: auth(adminToken),
        })
      ).json();
      expect(detail.audit).toHaveLength(1);
      expect(detail.audit[0].action).toBe('manual_create');
    });

    it('rechaza una hora de entrada futura: 409', async () => {
      const res = await manual(anaToken, { check_in: future(3_600_000) });
      expect(res.statusCode).toBe(409);
    });

    it('rechaza salida anterior a la entrada: 400', async () => {
      const res = await manual(anaToken, {
        check_in: '2026-06-13T10:00:00.000Z',
        check_out: '2026-06-13T08:00:00.000Z',
      });
      expect(res.statusCode).toBe(400);
    });

    it('rechaza salida futura: 409', async () => {
      const res = await manual(anaToken, {
        check_in: '2026-06-13T08:00:00.000Z',
        check_out: future(3_600_000),
      });
      expect(res.statusCode).toBe(409);
    });

    it('rechaza solapamiento con otro fichaje: 409', async () => {
      await seedConfirmed('2026-06-10T10:00:00.000Z', '2026-06-10T14:00:00.000Z');
      const res = await manual(anaToken, {
        check_in: '2026-06-10T13:00:00.000Z',
        check_out: '2026-06-10T15:00:00.000Z',
      });
      expect(res.statusCode).toBe(409);
    });

    it('un admin no ficha manualmente: 403', async () => {
      const res = await manual(adminToken, { check_in: '2026-06-13T08:00:00.000Z' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/attendance/:id/validate', () => {
    async function createPending(): Promise<string> {
      const res = await manual(anaToken, {
        check_in: '2026-06-13T08:00:00.000Z',
        check_out: '2026-06-13T16:00:00.000Z',
      });
      return res.json().id;
    }

    it('el admin aprueba: status confirmed + auditoría manual_validate', async () => {
      const id = await createPending();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${id}/validate`,
        headers: auth(adminToken),
        payload: { decision: 'approve' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('confirmed');

      const detail = (
        await app.inject({
          method: 'GET',
          url: `/api/v1/attendance/${id}`,
          headers: auth(adminToken),
        })
      ).json();
      const actions = detail.audit.map((a: { action: string }) => a.action);
      expect(actions).toContain('manual_validate');
    });

    it('el admin rechaza: status rejected', async () => {
      const id = await createPending();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${id}/validate`,
        headers: auth(adminToken),
        payload: { decision: 'reject', reason: 'no consta actividad' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('rejected');
    });

    it('un empleado no puede validar: 403', async () => {
      const id = await createPending();
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${id}/validate`,
        headers: auth(anaToken),
        payload: { decision: 'approve' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('validar un registro que no está pendiente: 409', async () => {
      const id = await createPending();
      await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${id}/validate`,
        headers: auth(adminToken),
        payload: { decision: 'approve' },
      });
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/attendance/${id}/validate`,
        headers: auth(adminToken),
        payload: { decision: 'approve' },
      });
      expect(res.statusCode).toBe(409);
    });

    it('registro inexistente: 404', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/attendance/00000000-0000-0000-0000-000000000000/validate',
        headers: auth(adminToken),
        payload: { decision: 'approve' },
      });
      expect(res.statusCode).toBe(404);
    });
  });
});
