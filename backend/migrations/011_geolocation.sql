-- HU-07: geolocalización del fichaje (RGPD) + geocerca.
-- En app_settings: modo (off/opcional/obligatoria) y la zona de trabajo
-- (centro + radio). En attendance: coordenadas de entrada/salida y si cayeron
-- fuera de la geocerca (snapshot en el momento del fichaje).

ALTER TABLE app_settings
  ADD COLUMN geolocation_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (geolocation_mode IN ('off', 'optional', 'required')),
  ADD COLUMN geofence_lat DOUBLE PRECISION,
  ADD COLUMN geofence_lng DOUBLE PRECISION,
  ADD COLUMN geofence_radius_m INTEGER;

ALTER TABLE attendance
  ADD COLUMN check_in_lat DOUBLE PRECISION,
  ADD COLUMN check_in_lng DOUBLE PRECISION,
  ADD COLUMN check_in_outside BOOLEAN,
  ADD COLUMN check_out_lat DOUBLE PRECISION,
  ADD COLUMN check_out_lng DOUBLE PRECISION,
  ADD COLUMN check_out_outside BOOLEAN;
