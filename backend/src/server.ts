import 'dotenv/config';
import cron from 'node-cron';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { processAutoClose } from './lib/autoClose.js';
import { detectAbsences } from './lib/absences.js';
import { sendAbsenceEmail } from './lib/email.js';

const config = loadConfig();
const app = await buildApp(config);

try {
  const applied = await runMigrations(app.pg);
  if (applied.length > 0) {
    app.log.info(`Migraciones aplicadas: ${applied.join(', ')}`);
  }
  await app.listen({ port: config.port, host: config.host });

  // HU-03: scheduler de cierre automático de turnos olvidados
  if (config.autoCloseEnabled) {
    cron.schedule(config.autoCloseCron, () => {
      processAutoClose(app.pg, {
        timezone: config.appTimezone,
        warnMinutes: config.autoCloseWarnMinutes,
        graceMinutes: config.autoCloseGraceMinutes,
        maxShiftHours: config.maxShiftHours,
      })
        .then((res) => {
          if (res.warned.length > 0 || res.closed.length > 0) {
            app.log.info(
              `Cierre automático: ${res.closed.length} cerrados, ${res.warned.length} avisados`
            );
          }
        })
        .catch((err) => app.log.error(err, 'Fallo en el cierre automático'));
    });
    app.log.info(`Cierre automático activo (cron: ${config.autoCloseCron})`);
  }

  // HU-01: detección diaria de ausencias injustificadas (del día anterior)
  if (config.absenceCheckEnabled) {
    cron.schedule(config.absenceCheckCron, () => {
      detectAbsences(app.pg, { timezone: config.appTimezone })
        .then(async (flagged) => {
          if (flagged.length > 0) {
            app.log.info(`Ausencias injustificadas detectadas: ${flagged.length}`);
          }
          // Email best-effort (hoy stub; el aviso efectivo es la notificación in-app)
          for (const f of flagged) {
            await sendAbsenceEmail(config, f).catch((err) =>
              app.log.error(err, 'Fallo enviando email de ausencia')
            );
          }
        })
        .catch((err) => app.log.error(err, 'Fallo en la detección de ausencias'));
    });
    app.log.info(`Detección de ausencias activa (cron: ${config.absenceCheckCron})`);
  }
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
