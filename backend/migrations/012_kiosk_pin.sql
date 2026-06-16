-- HU-08: modo kiosco. Cada empleado tiene un PIN (hash) para fichar en un
-- dispositivo compartido mediante teclado o QR (el QR codifica el mismo PIN).

ALTER TABLE users ADD COLUMN pin_hash TEXT;

-- Un PIN no puede repetirse entre empleados (el kiosco identifica por PIN).
CREATE UNIQUE INDEX uniq_users_pin ON users (pin_hash) WHERE pin_hash IS NOT NULL;
