-- HU-03: el empleado puede confirmar que sigue trabajando ("Sigo aquí") y
-- posponer el cierre automático. El cron respeta esta marca hasta que expira;
-- al confirmar se reinicia el aviso para volver a avisar cuando caduque.

ALTER TABLE attendance
  ADD COLUMN auto_close_snooze_until TIMESTAMPTZ;
