import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';
import { processAutoClose, type AutoCloseOptions } from '../src/lib/autoClose.js';

describe('HU-03: cierre automático de turno', () => {
  let app: FastifyInstance;
  let anaId: string;

  const opts: AutoCloseOptions = {
    timezone: 'UTC',
    warnMinutes: 15,
    graceMinutes: 30,
    maxShiftHours: 12,
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(app);
    await createUserAndToken(app, {
      email: 'admin@empresa.com',
      password: 'clave-admin-123',
      name: 'Admin',
      role: 'admin',
    });
    const ana = await createUserAndToken(app, {
      email: 'ana@empresa.com',
      password: 'clave-segura-123',
      name: 'Ana López',
    });
    anaId = ana.id;
  });

  async function giveSchedule(
    blocks: { weekday: number; start: string; end: string }[]
  ): Promise<void> {
    const { rows } = await app.pg.query<{ id: string }>(
      `INSERT INTO schedule_templates (name) VALUES ('Horario test') RETURNING id`
    );
    const templateId = rows[0]!.id;
    for (const b of blocks) {
      await app.pg.query(
        `INSERT INTO schedule_template_days (template_id, weekday, start_time, end_time)
         VALUES ($1, $2, $3, $4)`,
        [templateId, b.weekday, b.start, b.end]
      );
    }
    await app.pg.query(
      `INSERT INTO employee_schedules (employee_id, template_id, valid_from)
       VALUES ($1, $2, '2020-01-01')`,
      [anaId, templateId]
    );
  }

  // L-V 09:00-17:00
  const fullTime = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: '09:00', end: '17:00' }));

  async function seedOpenShift(checkInIso: string): Promise<string> {
    const { rows } = await app.pg.query<{ id: string }>(
      `INSERT INTO attendance (employee_id, employee_name, check_in)
       VALUES ($1, 'Ana López', $2) RETURNING id`,
      [anaId, checkInIso]
    );
    return rows[0]!.id;
  }

  const at = (iso: string) => new Date(iso);

  it('avisa una vez pasada la hora teórica + warnMinutes, sin cerrar', async () => {
    await giveSchedule(fullTime);
    // 2026-06-10 es miércoles; fin teórico 17:00Z
    const id = await seedOpenShift('2026-06-10T08:00:00.000Z');

    const res = await processAutoClose(app.pg, opts, at('2026-06-10T17:16:00.000Z'));

    expect(res.warned).toContain(id);
    expect(res.closed).toHaveLength(0);

    const a = await app.pg.query('SELECT check_out, close_warning_sent_at FROM attendance WHERE id = $1', [id]);
    expect(a.rows[0].check_out).toBeNull();
    expect(a.rows[0].close_warning_sent_at).not.toBeNull();

    const n = await app.pg.query('SELECT id FROM notifications WHERE attendance_id = $1', [id]);
    expect(n.rows).toHaveLength(1);
  });

  it('cierra a la hora teórica pasada la hora + graceMinutes, con auditoría system_close', async () => {
    await giveSchedule(fullTime);
    const id = await seedOpenShift('2026-06-10T08:00:00.000Z');

    const res = await processAutoClose(app.pg, opts, at('2026-06-10T17:31:00.000Z'));

    expect(res.closed).toContain(id);
    const a = await app.pg.query('SELECT check_out FROM attendance WHERE id = $1', [id]);
    expect(new Date(a.rows[0].check_out).toISOString()).toBe('2026-06-10T17:00:00.000Z');

    const au = await app.pg.query('SELECT action FROM attendance_audit WHERE attendance_id = $1', [id]);
    expect(au.rows.some((r: { action: string }) => r.action === 'system_close')).toBe(true);
  });

  it('no toca un turno aún dentro de su horario', async () => {
    await giveSchedule(fullTime);
    const id = await seedOpenShift('2026-06-10T08:00:00.000Z');

    const res = await processAutoClose(app.pg, opts, at('2026-06-10T17:10:00.000Z'));

    expect(res.warned).toHaveLength(0);
    expect(res.closed).toHaveLength(0);
    void id;
  });

  it('sin horario asignado, cierra usando maxShiftHours como red de seguridad', async () => {
    const id = await seedOpenShift('2026-06-10T08:00:00.000Z'); // 08:00 + 12h = 20:00

    const res = await processAutoClose(app.pg, opts, at('2026-06-10T20:31:00.000Z'));

    expect(res.closed).toContain(id);
    const a = await app.pg.query('SELECT check_out FROM attendance WHERE id = $1', [id]);
    expect(new Date(a.rows[0].check_out).toISOString()).toBe('2026-06-10T20:00:00.000Z');
  });

  it('no repite el aviso en pasadas sucesivas', async () => {
    await giveSchedule(fullTime);
    const id = await seedOpenShift('2026-06-10T08:00:00.000Z');

    await processAutoClose(app.pg, opts, at('2026-06-10T17:16:00.000Z'));
    const res = await processAutoClose(app.pg, opts, at('2026-06-10T17:20:00.000Z'));

    expect(res.warned).toHaveLength(0);
    const n = await app.pg.query('SELECT id FROM notifications WHERE attendance_id = $1', [id]);
    expect(n.rows).toHaveLength(1);
  });

  it('turno nocturno: cierra al día siguiente a la hora teórica de fin', async () => {
    // miércoles 22:00 -> 06:00 del jueves
    await giveSchedule([{ weekday: 3, start: '22:00', end: '06:00' }]);
    const id = await seedOpenShift('2026-06-10T22:00:00.000Z');

    const res = await processAutoClose(app.pg, opts, at('2026-06-11T06:31:00.000Z'));

    expect(res.closed).toContain(id);
    const a = await app.pg.query('SELECT check_out FROM attendance WHERE id = $1', [id]);
    expect(new Date(a.rows[0].check_out).toISOString()).toBe('2026-06-11T06:00:00.000Z');
  });
});
