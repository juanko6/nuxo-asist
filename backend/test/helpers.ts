import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import type { AppConfig } from '../src/config.js';
import type { Role } from '../src/types.js';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://asist:asist@localhost:5433/asist_test';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    databaseUrl: TEST_DATABASE_URL,
    jwtSecret: 'secreto-solo-para-tests-no-usar-fuera',
    jwtExpiresIn: '1h',
    port: 0,
    host: '127.0.0.1',
    corsOrigin: 'http://localhost:5173',
    bcryptRounds: 4,
    appTimezone: 'UTC',
    logLevel: 'silent',
    logger: false,
    autoCloseEnabled: false,
    autoCloseCron: '*/5 * * * *',
    autoCloseWarnMinutes: 15,
    autoCloseGraceMinutes: 30,
    maxShiftHours: 12,
    absenceCheckEnabled: false,
    absenceCheckCron: '0 6 * * *',
    emailEnabled: false,
    rateLimitEnabled: false,
    rateLimitMax: 100,
    rateLimitWindow: '1 minute',
    authRateLimitMax: 10,
    smtpHost: '',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: '',
    smtpPass: '',
    smtpFrom: 'Test <test@asist.local>',
    ...overrides,
  };
}

export async function createTestApp(
  overrides: Partial<AppConfig> = {}
): Promise<FastifyInstance> {
  const app = await buildApp(testConfig(overrides));
  await runMigrations(app.pg);
  return app;
}

export async function resetDb(app: FastifyInstance): Promise<void> {
  await app.pg.query(
    `TRUNCATE notifications, login_logs, attendance, schedule_templates, app_settings, users
     RESTART IDENTITY CASCADE`
  );
}

export interface TestUserInput {
  email: string;
  password: string;
  name?: string;
  role?: Role;
  department?: string;
  position?: string;
}

export async function insertUser(
  app: FastifyInstance,
  input: TestUserInput
): Promise<string> {
  const hash = await bcrypt.hash(input.password, 4);
  const { rows } = await app.pg.query<{ id: string }>(
    `INSERT INTO users (email, name, password_hash, role, department, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      input.email,
      input.name ?? 'Usuario Test',
      hash,
      input.role ?? 'employee',
      input.department ?? 'Testing',
      input.position ?? 'Tester',
    ]
  );
  return rows[0]!.id;
}

export async function loginAs(
  app: FastifyInstance,
  email: string,
  password: string
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  if (res.statusCode !== 200) {
    throw new Error(`loginAs falló (${res.statusCode}): ${res.body}`);
  }
  return res.json().token as string;
}

/** Crea un usuario y devuelve su token en un solo paso. */
export async function createUserAndToken(
  app: FastifyInstance,
  input: TestUserInput
): Promise<{ id: string; token: string }> {
  const id = await insertUser(app, input);
  const token = await loginAs(app, input.email, input.password);
  return { id, token };
}
