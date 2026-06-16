import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { FastifyInstance } from 'fastify';
import { createTestApp } from './helpers.js';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

interface OpenApiDoc {
  servers: Array<{ url: string }>;
  paths: Record<string, Record<string, unknown>>;
}

describe('Contrato OpenAPI', () => {
  let app: FastifyInstance;
  let spec: OpenApiDoc;

  beforeAll(async () => {
    app = await createTestApp();
    const specPath = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      'docs',
      'openapi.yaml'
    );
    spec = parse(await readFile(specPath, 'utf8')) as OpenApiDoc;
  });

  afterAll(async () => {
    await app.close();
  });

  it('todas las operaciones del contrato existen en la API (ninguna responde 404 de ruta)', async () => {
    const basePath = spec.servers[0]!.url;
    const missing: string[] = [];

    for (const [path, operations] of Object.entries(spec.paths)) {
      for (const method of HTTP_METHODS) {
        if (!(method in operations)) continue;
        // Sustituye los parámetros de ruta por un UUID válido para que el router matchee
        const url =
          basePath + path.replace(/\{[^}]+\}/g, '00000000-0000-0000-0000-000000000000');
        const res = await app.inject({ method: method.toUpperCase() as 'GET', url });
        // 404 con código NOT_FOUND del handler es válido (recurso inexistente);
        // lo que delata una ruta sin implementar es el 404 genérico del router de Fastify.
        const isRouterNotFound =
          res.statusCode === 404 &&
          !res.body.includes('NOT_FOUND');
        if (isRouterNotFound) {
          missing.push(`${method.toUpperCase()} ${path}`);
        }
      }
    }

    expect(missing, `Operaciones del contrato sin implementar: ${missing.join(', ')}`).toEqual([]);
  });

  it('la documentación Swagger UI está disponible en /api/docs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/docs' });
    expect([200, 302]).toContain(res.statusCode);
  });
});
