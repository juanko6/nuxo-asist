-- HU-03: cierre automático de turno por olvido.
-- Marca de aviso "¿sigues trabajando?" para no repetirlo en cada pasada del
-- scheduler. El cierre automático en sí se registra en la auditoría (system_close).

ALTER TABLE attendance
  ADD COLUMN close_warning_sent_at TIMESTAMPTZ;
