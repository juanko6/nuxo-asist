-- HU-05: plantillas de horario y asignación por empleado con vigencias.
-- Da la "carga horaria semanal esperada" y la hora teórica de cada jornada,
-- que HU-03 (cierre automático) y HU-01 (ausencias) consumirán más adelante.

-- Plantilla reutilizable (L-V 09:00-17:00, media jornada, turno mañana...).
-- Un horario "personalizado" de un empleado = una plantilla dedicada a él.
CREATE TABLE schedule_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_schedule_templates_name ON schedule_templates (lower(name));

-- Bloques de trabajo por día. La ausencia de fila para un día = día libre.
-- weekday en formato ISO: 1=lunes ... 7=domingo.
-- end_time <= start_time indica turno nocturno (cruza medianoche).
CREATE TABLE schedule_template_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_schedule_template_days_template ON schedule_template_days (template_id);
-- Permite partir la jornada en varios bloques el mismo día, pero no duplicar uno
CREATE UNIQUE INDEX uniq_template_day_block
  ON schedule_template_days (template_id, weekday, start_time);

-- Asignación de plantilla a empleado con vigencia. Un cambio a mitad de semana
-- cierra la asignación anterior (valid_to) y abre una nueva desde la fecha indicada,
-- de modo que los informes pasados no se alteran.
CREATE TABLE employee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES schedule_templates(id) ON DELETE RESTRICT,
  valid_from DATE NOT NULL,
  valid_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE INDEX idx_employee_schedules_employee ON employee_schedules (employee_id);
-- Una sola asignación abierta (vigente) por empleado
CREATE UNIQUE INDEX uniq_employee_schedule_open
  ON employee_schedules (employee_id) WHERE valid_to IS NULL;

CREATE TRIGGER update_schedule_templates_updated_at
  BEFORE UPDATE ON schedule_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
