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

const UpdateSettingsSchema = z
  .object({
    company_name: CompanyName.optional(),
    geolocation_mode: z.enum(['off', 'optional', 'required']).optional(),
    geofence_lat: z.number().min(-90).max(90).nullable().optional(),
    geofence_lng: z.number().min(-180).max(180).nullable().optional(),
    geofence_radius_m: z.number().int().min(10).max(100000).nullable().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, { message: 'Nada que actualizar' });

interface AppSettings {
  company_name: string | null;
  geolocation_mode: 'off' | 'optional' | 'required';
  geofence_lat: number | null;
  geofence_lng: number | null;
  geofence_radius_m: number | null;
}

async function adminExists(app: Parameters<FastifyPluginAsync>[0]): Promise<boolean> {
  const { rows } = await app.pg.query(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`);
  return rows.length > 0;
}

async function getSettings(app: Parameters<FastifyPluginAsync>[0]): Promise<AppSettings> {
  const { rows } = await app.pg.query<AppSettings>(
    `SELECT company_name, geolocation_mode, geofence_lat, geofence_lng, geofence_radius_m
     FROM app_settings WHERE id = 1`
  );
  return (
    rows[0] ?? {
      company_name: null,
      geolocation_mode: 'off',
      geofence_lat: null,
      geofence_lng: null,
      geofence_radius_m: null,
    }
  );
}

export const setupRoutes: FastifyPluginAsync = async (app) => {
  // Estado del arranque inicial (público): si no hay admin, toca configurar.
  app.get('/setup/status', async () => {
    const [needsSetup, settings] = await Promise.all([
      adminExists(app).then((e) => !e),
      getSettings(app),
    ]);
    return { needs_setup: needsSetup, company_name: settings.company_name };
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

  // Ajustes públicos: branding + modo de geolocalización y geocerca (los necesita
  // la pantalla de fichaje). La ubicación de la empresa no es dato sensible.
  app.get('/settings', async () => getSettings(app));

  app.put('/settings', { preHandler: [app.authenticate, app.requireAdmin] }, async (request) => {
    const input = UpdateSettingsSchema.parse(request.body);

    const cols: string[] = [];
    const values: unknown[] = [];
    const add = (col: string, val: unknown) => {
      values.push(val);
      cols.push(`${col} = $${values.length}`);
    };
    if (input.company_name !== undefined) add('company_name', input.company_name);
    if (input.geolocation_mode !== undefined) add('geolocation_mode', input.geolocation_mode);
    if (input.geofence_lat !== undefined) add('geofence_lat', input.geofence_lat);
    if (input.geofence_lng !== undefined) add('geofence_lng', input.geofence_lng);
    if (input.geofence_radius_m !== undefined) add('geofence_radius_m', input.geofence_radius_m);

    await app.pg.query(
      `UPDATE app_settings SET ${cols.join(', ')}, updated_at = now() WHERE id = 1`,
      values
    );
    return getSettings(app);
  });
};
