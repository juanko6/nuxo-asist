import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const ListQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha esperado: YYYY-MM-DD')
    .optional(),
});

export const loginLogsRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, app.requireAdmin] };

  app.get('/login-logs', adminOnly, async (request) => {
    const { date } = ListQuerySchema.parse(request.query);
    if (date) {
      const { rows } = await app.pg.query(
        `SELECT * FROM login_logs
         WHERE (login_time AT TIME ZONE $1)::date = $2::date
         ORDER BY login_time DESC`,
        [app.config.appTimezone, date]
      );
      return rows;
    }
    const { rows } = await app.pg.query(
      'SELECT * FROM login_logs ORDER BY login_time DESC'
    );
    return rows;
  });
};
