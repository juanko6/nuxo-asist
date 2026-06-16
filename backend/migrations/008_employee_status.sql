-- HU: baja de empleados sin borrar (la ley obliga a conservar registros 4+ años).
-- Un empleado dado de baja pasa a 'inactive' (no puede acceder ni cuenta para
-- ausencias), pero su histórico permanece intacto.

ALTER TABLE users
  ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX idx_users_status ON users (status);
