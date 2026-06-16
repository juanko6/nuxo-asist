import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb, testConfig } from './helpers.js';
import { sendSupportEmail } from '../src/lib/email.js';

describe('Soporte: tickets y aviso a nuxoasist', () => {
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
        name: 'Ana Admin',
        role: 'admin',
      })
    ).token;
    await app.pg.query(
      `INSERT INTO app_settings (id, company_name) VALUES (1, 'Empresa Test')`
    );
  });

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const create = (token: string, body: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/api/v1/support', headers: auth(token), payload: body });

  it('el admin levanta un ticket: se guarda con su empresa y autor', async () => {
    const res = await create(adminToken, {
      subject: 'No puedo exportar el CSV',
      message: 'Al pulsar exportar no pasa nada en el panel.',
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.ticket.subject).toBe('No puedo exportar el CSV');
    expect(body.email_sent).toBe(false); // email deshabilitado en tests

    const { rows } = await app.pg.query('SELECT * FROM support_tickets');
    expect(rows).toHaveLength(1);
    expect(rows[0].company_name).toBe('Empresa Test');
    expect(rows[0].created_by_email).toBe('admin@empresa.com');
    expect(rows[0].status).toBe('open');
  });

  it('valida asunto y mensaje (400)', async () => {
    expect((await create(adminToken, { subject: 'x', message: 'también corto' })).statusCode).toBe(400);
    expect((await create(adminToken, { subject: 'Asunto válido', message: 'corto' })).statusCode).toBe(400);
  });

  it('un empleado no puede abrir tickets (403)', async () => {
    const emp = await createUserAndToken(app, {
      email: 'curro@empresa.com',
      password: 'clave-segura-1',
      role: 'employee',
    });
    const res = await create(emp.token, {
      subject: 'Asunto válido',
      message: 'Mensaje suficientemente largo.',
    });
    expect(res.statusCode).toBe(403);
  });

  it('sendSupportEmail compone el correo al buzón de soporte', async () => {
    const sent: Record<string, unknown>[] = [];
    const fakeTransport = {
      sendMail: async (m: Record<string, unknown>) => {
        sent.push(m);
        return { messageId: 'x' };
      },
    } as unknown as Parameters<typeof sendSupportEmail>[2];

    const ok = await sendSupportEmail(
      testConfig({ supportEmail: 'nuxoasist@gmail.com' }),
      {
        subject: 'Ayuda',
        message: 'Tengo una duda',
        fromName: 'Ana',
        fromEmail: 'ana@empresa.com',
        companyName: 'Empresa Test',
      },
      fakeTransport
    );

    expect(ok).toBe(true);
    expect(sent[0]!.to).toBe('nuxoasist@gmail.com');
    expect(String(sent[0]!.subject)).toContain('[Soporte nuxoasist]');
    expect(sent[0]!.replyTo).toBe('ana@empresa.com');
  });
});
