-- Configuración de la instancia (single-tenant): nombre de empresa para el
-- onboarding inicial y el branding. Fila única garantizada por el CHECK.

CREATE TABLE app_settings (
  id           smallint PRIMARY KEY DEFAULT 1,
  company_name TEXT NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT app_settings_singleton CHECK (id = 1)
);
