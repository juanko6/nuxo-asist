-- Soporte: el admin levanta un ticket desde la app. Se guarda aquí y, además,
-- se envía un correo al equipo de nuxoasist (best-effort).

CREATE TABLE support_tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject          TEXT NOT NULL,
  message          TEXT NOT NULL,
  created_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_name  TEXT NOT NULL,
  created_by_email TEXT NOT NULL,
  company_name     TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_tickets_created_at ON support_tickets (created_at DESC);
