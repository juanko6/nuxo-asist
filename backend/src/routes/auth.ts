import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { invalidCredentials } from '../lib/errors.js';
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
      `SELECT id, email, name, role, department, position, created_at, password_hash
       FROM users
       WHERE lower(email) = lower($1)`,
      [email]
    );
    const row = rows[0];

    const passwordOk = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
    if (!row || !passwordOk) {
      throw invalidCredentials();
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
};
