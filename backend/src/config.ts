import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatoria'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET debe tener al menos 16 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(10),
  APP_TIMEZONE: z.string().default('UTC'),
  LOG_LEVEL: z.string().default('info'),
  // HU-03: cierre automático de turnos olvidados
  AUTO_CLOSE_ENABLED: z.string().default('true').transform((v) => v.toLowerCase() !== 'false'),
  AUTO_CLOSE_CRON: z.string().default('*/5 * * * *'),
  AUTO_CLOSE_WARN_MINUTES: z.coerce.number().int().min(0).default(15),
  AUTO_CLOSE_GRACE_MINUTES: z.coerce.number().int().min(0).default(30),
  MAX_SHIFT_HOURS: z.coerce.number().int().min(1).default(12),
  // HU-01: detección de ausencias injustificadas
  ABSENCE_CHECK_ENABLED: z.string().default('true').transform((v) => v.toLowerCase() !== 'false'),
  ABSENCE_CHECK_CRON: z.string().default('0 6 * * *'),
  // Envío de email (de momento deshabilitado; el aviso efectivo es in-app)
  EMAIL_ENABLED: z.string().default('false').transform((v) => v.toLowerCase() === 'true'),
  // Rate limiting (HU hardening)
  RATE_LIMIT_ENABLED: z.string().default('true').transform((v) => v.toLowerCase() !== 'false'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
});

export interface AppConfig {
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  port: number;
  host: string;
  corsOrigin: string;
  bcryptRounds: number;
  appTimezone: string;
  logLevel: string;
  logger: boolean;
  autoCloseEnabled: boolean;
  autoCloseCron: string;
  autoCloseWarnMinutes: number;
  autoCloseGraceMinutes: number;
  maxShiftHours: number;
  absenceCheckEnabled: boolean;
  absenceCheckCron: string;
  emailEnabled: boolean;
  rateLimitEnabled: boolean;
  rateLimitMax: number;
  rateLimitWindow: string;
  authRateLimitMax: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Configuración inválida: ${issues}`);
  }
  const e = parsed.data;
  return {
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    jwtExpiresIn: e.JWT_EXPIRES_IN,
    port: e.PORT,
    host: e.HOST,
    corsOrigin: e.CORS_ORIGIN,
    bcryptRounds: e.BCRYPT_ROUNDS,
    appTimezone: e.APP_TIMEZONE,
    logLevel: e.LOG_LEVEL,
    logger: true,
    autoCloseEnabled: e.AUTO_CLOSE_ENABLED,
    autoCloseCron: e.AUTO_CLOSE_CRON,
    autoCloseWarnMinutes: e.AUTO_CLOSE_WARN_MINUTES,
    autoCloseGraceMinutes: e.AUTO_CLOSE_GRACE_MINUTES,
    maxShiftHours: e.MAX_SHIFT_HOURS,
    absenceCheckEnabled: e.ABSENCE_CHECK_ENABLED,
    absenceCheckCron: e.ABSENCE_CHECK_CRON,
    emailEnabled: e.EMAIL_ENABLED,
    rateLimitEnabled: e.RATE_LIMIT_ENABLED,
    rateLimitMax: e.RATE_LIMIT_MAX,
    rateLimitWindow: e.RATE_LIMIT_WINDOW,
    authRateLimitMax: e.AUTH_RATE_LIMIT_MAX,
  };
}
