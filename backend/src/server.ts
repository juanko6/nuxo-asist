import 'dotenv/config';
import cron from 'node-cron';
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { processAutoClose } from './lib/autoClose.js';

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
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
