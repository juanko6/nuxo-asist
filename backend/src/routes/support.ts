import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { sendSupportEmail } from '../lib/email.js';
import type { SupportTicket } from '../types.js';

const CreateTicketSchema = z.object({
  subject: z.string().trim().min(3).max(150),
  message: z.string().trim().min(10).max(4000),
});

export const supportRoutes: FastifyPluginAsync = async (app) => {
  // Solo admin: levanta un ticket (se guarda) y avisa al equipo de nuxoasist.
  app.post(
    '/support',
    { preHandler: [app.authenticate, app.requireAdmin] },
    async (request, reply) => {
      const { subject, message } = CreateTicketSchema.parse(request.body);
      const { id: userId, name, email } = request.currentUser;

      const { rows: settings } = await app.pg.query<{ company_name: string }>(
        'SELECT company_name FROM app_settings WHERE id = 1'
      );
      const companyName = settings[0]?.company_name ?? null;

      const { rows } = await app.pg.query<SupportTicket>(
        `INSERT INTO support_tickets
           (subject, message, created_by, created_by_name, created_by_email, company_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [subject, message, userId, name, email, companyName]
      );
      const ticket = rows[0]!;

      // Email best-effort: el ticket ya quedó guardado aunque el correo falle.
      let emailSent = false;
      try {
        emailSent = await sendSupportEmail(app.config, {
          subject,
          message,
          fromName: name,
          fromEmail: email,
          companyName,
        });
      } catch (err) {
        app.log.error(err, 'Fallo enviando el email de soporte');
      }

      return reply.code(201).send({ ticket, email_sent: emailSent });
    }
  );
};
