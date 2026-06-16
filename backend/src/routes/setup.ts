import type { FastifyPluginAsync } from 'fastify';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { conflict } from '../lib/errors.js';

const CompanyName = z.string().trim().min(2).max(60);

const SetupSchema = z.object({
  company_name: CompanyName,
  admin_name: z.string().trim().min(2).max(100),
  admin_email: z.string().email(),
  admin_password: z.string().min(8).max(100),
});

const SettingsSchema = z.object({ company_name: CompanyName });

async function adminExists(app: Parameters<FastifyPluginAsync>[0]): Promise<boolean> {
  const { rows } = await app.pg.query(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`);
  return rows.length > 0;
}

async function getCompanyName(app: Parameters<FastifyPluginAsync>[0]): Promise<string | null> {
  const { rows } = await app.pg.query<{ company_name: string }>(
    'SELECT company_name FROM app_settings WHERE id = 1'
  );
  return rows[0]?.company_name ?? null;
}

export const setupRoutes: FastifyPluginAsync = async (app) => {
  // Estado del arranque inicial (público): si no hay admin, toca configurar.
  app.get('/setup/status', async () => {
    const [needsSetup, companyName] = await Promise.all([
      adminExists(app).then((e) => !e),
      getCompanyName(app),
    ]);
    return { needs_setup: needsSetup, company_name: companyName };
  });

  // Configuración inicial (público, pero solo válido una vez): crea la empresa
  // y su administrador. Tras esto, el acceso es por login normal.
  app.post('/setup', async (request, reply) => {
    const body = SetupSchema.parse(request.body);

    if (await adminExists(app)) {
      throw conflict('El sistema ya está configurado');
    }

    const hash = await bcrypt.hash(body.admin_password, app.config.bcryptRounds);
    const client = await app.pg.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (email, name, password_hash, role, department, position)
         VALUES ($1, $2, $3, 'admin', 'Dirección', 'Administración')`,
        [body.admin_email, body.admin_name, hash]
      );
      await client.query(
        `INSERT INTO app_settings (id, company_name) VALUES (1, $1)
         ON CONFLICT (id) DO UPDATE SET company_name = EXCLUDED.company_name, updated_at = now()`,
        [body.company_name]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    return reply.code(201).send({ company_name: body.company_name });
  });

  // Branding (público): el login y la cabecera muestran el nombre de la empresa.
  app.get('/settings', async () => {
    return { company_name: await getCompanyName(app) };
  });

  app.put('/settings', { preHandler: [app.authenticate, app.requireAdmin] }, async (request) => {
    const { company_name } = SettingsSchema.parse(request.body);
    await app.pg.query(
      `INSERT INTO app_settings (id, company_name) VALUES (1, $1)
       ON CONFLICT (id) DO UPDATE SET company_name = $1, updated_at = now()`,
      [company_name]
    );
    return { company_name };
  });
};
