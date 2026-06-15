import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';

describe('HU-06: hora de intención (intended_at)', () => {
  let app: FastifyInstance;
  let anaToken: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app);
    anaToken = (
      await createUserAndToken(app, {
        email: 'ana@empresa.com',
        password: 'clave-segura-123',
        name: 'Ana López',
      })
    ).token;
  });

  const checkIn = (intended_at?: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/attendance/check-in',
      headers: { authorization: `Bearer ${anaToken}` },
      payload: intended_at ? { intended_at } : {},
    });

  it('usa la hora de intención si cae en los últimos 2 minutos', async () => {
    const intended = new Date(Date.now() - 60_000).toISOString(); // hace 1 min
    const res = await checkIn(intended);

    expect(res.statusCode).toBe(201);
    const diff = Math.abs(new Date(res.json().check_in).getTime() - new Date(intended).getTime());
    expect(diff).toBeLessThan(2000);
  });

  it('ignora una intención demasiado antigua (>2 min) y usa la hora actual', async () => {
    const tooOld = new Date(Date.now() - 5 * 60_000).toISOString(); // hace 5 min
    const res = await checkIn(tooOld);

    const checkInMs = new Date(res.json().check_in).getTime();
    expect(Math.abs(checkInMs - Date.now())).toBeLessThan(5000);
    expect(checkInMs - new Date(tooOld).getTime()).toBeGreaterThan(4 * 60_000);
  });

  it('ignora una intención futura y usa la hora actual', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await checkIn(future);

    const checkInMs = new Date(res.json().check_in).getTime();
    expect(Math.abs(checkInMs - Date.now())).toBeLessThan(5000);
  });

  it('sin intended_at funciona igual (hora del servidor)', async () => {
    const res = await checkIn();
    expect(res.statusCode).toBe(201);
    expect(Math.abs(new Date(res.json().check_in).getTime() - Date.now())).toBeLessThan(5000);
  });
});
