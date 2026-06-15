-- HU-02: fichaje con "registro olvidado" (entrada manual).
-- Añade el origen del fichaje y un estado de validación. La entrada manual queda
-- pendiente de validación por el responsable, manteniendo trazabilidad legal.

ALTER TABLE attendance
  ADD COLUMN source TEXT NOT NULL DEFAULT 'realtime'
    CHECK (source IN ('realtime', 'manual', 'system')),
  ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'pending_validation', 'rejected'));

CREATE INDEX idx_attendance_status ON attendance (status);

-- La validación de una entrada manual también deja huella en la auditoría.
ALTER TABLE attendance_audit
  DROP CONSTRAINT attendance_audit_action_check,
  ADD CONSTRAINT attendance_audit_action_check
    CHECK (action IN ('correction', 'manual_create', 'system_close', 'manual_validate'));
