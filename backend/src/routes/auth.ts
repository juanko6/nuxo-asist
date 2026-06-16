import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { badRequest, forbidden, invalidCredentials } from '../lib/errors.js';
import type { SafeUser } from '../types.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Hash de relleno: cuando el email no existe se compara igualmente contra él
// para que la respuesta tarde lo mismo y no se pueda enumerar emails por timing.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

type UserWithHash = SafeUser & { password_hash: string };

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Límite estricto en login para frenar fuerza bruta (si el rate limit global
  // está registrado; en otro caso esta config es metadata inerte).
  const loginConfig = app.config.rateLimitEnabled
    ? {
        config: {
          rateLimit: {
            max: app.config.authRateLimitMax,
            timeWindow: app.config.rateLimitWindow,
          },
        },
      }
    : {};

  app.post('/auth/login', loginConfig, async (request) => {
    const { email, password } = LoginSchema.parse(request.body);

    const { rows } = await app.pg.query<UserWithHash>(
      `SELECT id, email, name, role, department, position, status, archived_at, must_change_password, created_at, password_hash
       FROM users
       WHERE lower(email) = lower($1)`,
      [email]
    );
    const row = rows[0];

    const passwordOk = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !passwordOk) {
      throw invalidCredentials();
    }
    if (row.status === 'inactive') {
      throw forbidden('Tu cuenta está dada de baja. Contacta con tu responsable.');
    }

    const { password_hash: _hash, ...user } = row;

    if (user.role === 'employee') {
      await app.pg.query(
        'INSERT INTO login_logs (employee_id, employee_name) VALUES ($1, $2)',
        [user.id, user.name]
      );
    }

    const token = app.jwt.sign({ sub: user.id, role: user.role });
    return { token, user };
  });

  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request) => {
    return request.currentUser;
  });

  // Cambio de contraseña del propio usuario (también limpia must_change_password,
  // usado en el primer acceso de un empleado importado).
  const ChangePasswordSchema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(8).max(100),
  });

  app.post('/me/password', { preHandler: [app.authenticate] }, async (request) => {
    const { current_password, new_password } = ChangePasswordSchema.parse(request.body);

    const { rows } = await app.pg.query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [request.currentUser.id]
    );
    const ok = await bcrypt.compare(current_password, rows[0]!.password_hash);
    if (!ok) {
      throw badRequest('La contraseña actual no es correcta');
    }

    const hash = await bcrypt.hash(new_password, app.config.bcryptRounds);
    await app.pg.query(
      'UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1',
      [request.currentUser.id, hash]
    );
    return { ok: true };
  });
};
