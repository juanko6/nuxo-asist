-- HU-04: pausas intrajornada + auditoría inalterable (Ley de control horario 2026).
-- Las pausas (comida, café) se descuentan del tiempo trabajado; las correcciones
-- de un fichaje nunca destruyen el dato original, sino que dejan huella en auditoría.

-- Pausas dentro de una jornada. Se cierran al reanudar.
CREATE TABLE attendance_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  pause_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  pause_end TIMESTAMPTZ,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (pause_end IS NULL OR pause_end >= pause_start)
);

CREATE INDEX idx_attendance_pauses_attendance ON attendance_pauses (attendance_id);
-- Garantía dura: una sola pausa abierta por registro de asistencia
CREATE UNIQUE INDEX uniq_attendance_pause_open
  ON attendance_pauses (attendance_id) WHERE pause_end IS NULL;

-- Auditoría append-only: cada corrección conserva el valor previo y deja constancia
-- de quién, cuándo, qué cambió y por qué (motivo obligatorio por ley).
-- attendance_id / actor_id usan ON DELETE SET NULL para que la huella sobreviva
-- aunque el registro o el usuario se eliminen; actor_name queda desnormalizado.
CREATE TABLE attendance_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id UUID REFERENCES attendance(id) ON DELETE SET NULL,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('correction', 'manual_create', 'system_close')),
  reason TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendance_audit_attendance ON attendance_audit (attendance_id);
CREATE INDEX idx_attendance_audit_created ON attendance_audit (created_at);
