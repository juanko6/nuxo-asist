-- HU: alta masiva con contraseña temporal y cambio obligatorio en el primer
-- acceso. Los empleados creados por el admin (alta individual o por lotes) nacen
-- con must_change_password = true; se pone a false cuando cambian su contraseña.

ALTER TABLE users
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT false;
