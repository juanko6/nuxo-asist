import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';

const IdParams = z.object({ id: z.string().uuid() });

export const notificationsRoutes: FastifyPluginAsync = async (app) => {
  const adminOnly = { preHandler: [app.authenticate, app.requireAdmin] };

  app.get('/notifications', adminOnly, async () => {
    const { rows } = await app.pg.query(
      'SELECT * FROM notifications ORDER BY timestamp DESC'
    );
    return rows;
  });

  app.delete('/notifications/:id', adminOnly, async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const { rowCount } = await app.pg.query('DELETE FROM notifications WHERE id = $1', [
      id,
    ]);
    if (rowCount === 0) throw notFound('Notificación no encontrada');
    return reply.code(204).send();
  });
};
