import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import jwt from '@fastify/jwt';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ZodError } from 'zod';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from './config.js';
import { createPool } from './db/pool.js';
import { AppError, forbidden, unauthorized } from './lib/errors.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { employeesRoutes } from './routes/employees.js';
import { attendanceRoutes } from './routes/attendance.js';
import { schedulesRoutes } from './routes/schedules.js';
import { absencesRoutes } from './routes/absences.js';
import { setupRoutes } from './routes/setup.js';
import { notificationsRoutes } from './routes/notifications.js';
import { loginLogsRoutes } from './routes/loginLogs.js';
import type { SafeUser } from './types.js';

export const SAFE_USER_COLUMNS =
  'id, email, name, role, department, position, status, archived_at, created_at';

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.logger ? { level: config.logLevel } : false,
  });

  const pool = createPool(config.databaseUrl);
  app.decorate('pg', pool);
  app.decorate('config', config);
  app.addHook('onClose', async () => {
    await pool.end();
  });

  app.setErrorHandler((err: FastifyError | AppError | ZodError, request, reply) => {
    if (err instanceof AppError) {
      return reply
        .code(err.statusCode)
        .send({ error: { code: err.code, message: err.message } });
    }
    if (err instanceof ZodError) {
      const message = err.issues
        .map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
        .join('; ');
      return reply
        .code(400)
        .send({ error: { code: 'VALIDATION_ERROR', message } });
    }
    const status = err.statusCode ?? 500;
    if (status === 401) {
      return reply.code(401).send({
        error: { code: 'UNAUTHORIZED', message: 'Token ausente, inválido o expirado' },
      });
    }
    if (status < 500) {
      return reply
        .code(status)
        .send({ error: { code: 'VALIDATION_ERROR', message: err.message } });
    }
    request.log.error(err);
    return reply
      .code(500)
      .send({ error: { code: 'INTERNAL', message: 'Error interno del servidor' } });
  });

  // Cabeceras de seguridad. CSP desactivada: la SPA la sirve nginx, y la CSP por
  // defecto rompería la Swagger UI servida por el propio API.
  await app.register(helmet, { contentSecurityPolicy: false });

  // Rate limiting global (configurable; desactivado en tests). El límite estricto
  // de /auth/login se fija por ruta en el plugin de auth.
  if (config.rateLimitEnabled) {
    await app.register(rateLimit, {
      global: true,
      max: config.rateLimitMax,
      timeWindow: config.rateLimitWindow,
    });
  }

  await app.register(cors, {
    origin: config.corsOrigin.split(',').map((o) => o.trim()),
  });

  await app.register(jwt, {
    secret: config.jwtSecret,
    sign: { expiresIn: config.jwtExpiresIn },
  });

  app.decorate('authenticate', async (request) => {
    let payload: { sub: string };
    try {
      payload = await request.jwtVerify<{ sub: string }>();
    } catch {
      throw unauthorized('Token ausente, inválido o expirado');
    }
    const { rows } = await pool.query<SafeUser>(
      `SELECT ${SAFE_USER_COLUMNS} FROM users WHERE id = $1`,
      [payload.sub]
    );
    const user = rows[0];
    if (!user) {
      throw unauthorized('El usuario del token ya no existe');
    }
    request.currentUser = user;
  });

  app.decorate('requireAdmin', async (request) => {
    if (request.currentUser?.role !== 'admin') {
      throw forbidden();
    }
  });

  // Documentación: sirve el contrato OpenAPI (design-first) en /api/docs
  const specPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'docs',
    'openapi.yaml'
  );
  if (existsSync(specPath)) {
    await app.register(swagger, {
      mode: 'static',
      specification: { path: specPath, baseDir: dirname(specPath) },
    });
    await app.register(swaggerUi, { routePrefix: '/api/docs' });
  } else {
    app.log.warn(`Contrato OpenAPI no encontrado en ${specPath}; /api/docs deshabilitado`);
  }

  await app.register(healthRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(employeesRoutes, { prefix: '/api/v1' });
  await app.register(attendanceRoutes, { prefix: '/api/v1' });
  await app.register(schedulesRoutes, { prefix: '/api/v1' });
  await app.register(absencesRoutes, { prefix: '/api/v1' });
  await app.register(setupRoutes, { prefix: '/api/v1' });
  await app.register(notificationsRoutes, { prefix: '/api/v1' });
  await app.register(loginLogsRoutes, { prefix: '/api/v1' });

  return app;
}
