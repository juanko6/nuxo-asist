import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from './helpers.js';

describe('Hardening: seguridad del API', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
  });

  it('añade cabeceras de seguridad (helmet)', async () => {
    app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('limita los intentos de login con 429', async () => {
    app = await createTestApp({
      rateLimitEnabled: true,
      authRateLimitMax: 3,
      rateLimitWindow: '1 minute',
    });
    const attempt = () =>
      app!.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: 'nadie@empresa.com', password: 'incorrecta' },
      });

    const codes: number[] = [];
    for (let i = 0; i < 5; i++) codes.push((await attempt()).statusCode);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
  });

  it('aplica un límite global por IP', async () => {
    app = await createTestApp({
      rateLimitEnabled: true,
      rateLimitMax: 3,
      rateLimitWindow: '1 minute',
    });
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      codes.push((await app.inject({ method: 'GET', url: '/api/v1/health' })).statusCode);
    }
    expect(codes).toContain(429);
  });
});
