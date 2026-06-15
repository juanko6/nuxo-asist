-- HU-01: gestión de ausencias. El módulo de ausencias (vacaciones, bajas,
-- permisos) permite al cron diario distinguir una ausencia justificada de una
-- injustificada antes de avisar.

CREATE TABLE absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('vacation', 'sick_leave', 'leave', 'other')),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX idx_absences_employee ON absences (employee_id);
CREATE INDEX idx_absences_range ON absences (start_date, end_date);

-- Idempotencia del aviso de ausencia injustificada: un aviso por empleado y día.
CREATE TABLE absence_alerts (
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, alert_date)
);

-- Nuevo tipo de notificación para los avisos de ausencia.
ALTER TABLE notifications
  DROP CONSTRAINT notifications_type_check,
  ADD CONSTRAINT notifications_type_check
    CHECK (type IN ('overtime_request', 'approval', 'info', 'absence'));
