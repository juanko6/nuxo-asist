import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, createUserAndToken, resetDb } from './helpers.js';
import { distanceMeters, outsideGeofence } from '../src/lib/geo.js';

const MADRID = { lat: 40.4168, lng: -3.7038 };
const LEJOS = { lat: 40.5, lng: -3.7038 }; // ~9 km al norte

describe('HU-07: geolocalización y geocerca', () => {
  describe('lib/geo', () => {
    it('distanceMeters: misma coordenada = 0, lejos > 100 m', () => {
      expect(distanceMeters(MADRID.lat, MADRID.lng, MADRID.lat, MADRID.lng)).toBeCloseTo(0, 1);
      expect(distanceMeters(MADRID.lat, MADRID.lng, LEJOS.lat, LEJOS.lng)).toBeGreaterThan(100);
    });

    it('outsideGeofence: dentro=false, fuera=true, sin geocerca/coords=null', () => {
      const fence = { lat: MADRID.lat, lng: MADRID.lng, radius_m: 100 };
      expect(outsideGeofence(MADRID.lat, MADRID.lng, fence)).toBe(false);
      expect(outsideGeofence(LEJOS.lat, LEJOS.lng, fence)).toBe(true);
      expect(outsideGeofence(MADRID.lat, MADRID.lng, null)).toBeNull();
      expect(outsideGeofence(null, null, fence)).toBeNull();
    });
  });

  describe('API', () => {
    let app: FastifyInstance;
    let adminToken: string;
    let anaToken: string;

    beforeAll(async () => {
      app = await createTestApp();
    });
    afterAll(async () => {
      await app.close();
    });

    beforeEach(async () => {
      await resetDb(app);
      adminToken = (
        await createUserAndToken(app, {
          email: 'admin@empresa.com',
          password: 'clave-admin-123',
          name: 'Admin',
          role: 'admin',
        })
      ).token;
      anaToken = (
        await createUserAndToken(app, {
          email: 'ana@empresa.com',
          password: 'clave-segura-123',
          name: 'Ana',
        })
      ).token;
      await app.pg.query(`INSERT INTO app_settings (id, company_name) VALUES (1, 'Test')`);
    });

    const auth = (t: string) => ({ authorization: `Bearer ${t}` });
    const checkIn = (body: Record<string, unknown>) =>
      app.inject({ method: 'POST', url: '/api/v1/attendance/check-in', headers: auth(anaToken), payload: body });
    const setGeo = (mode: string, fence?: { lat: number; lng: number; r: number }) =>
      app.pg.query(
        `UPDATE app_settings SET geolocation_mode=$1, geofence_lat=$2, geofence_lng=$3, geofence_radius_m=$4 WHERE id=1`,
        [mode, fence?.lat ?? null, fence?.lng ?? null, fence?.r ?? null]
      );

    it('el admin configura el modo y la geocerca; GET /settings los devuelve', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/settings',
        headers: auth(adminToken),
        payload: { geolocation_mode: 'required', geofence_lat: MADRID.lat, geofence_lng: MADRID.lng, geofence_radius_m: 150 },
      });
      expect(res.statusCode).toBe(200);

      const s = (await app.inject({ method: 'GET', url: '/api/v1/settings' })).json();
      expect(s.geolocation_mode).toBe('required');
      expect(s.geofence_radius_m).toBe(150);
    });

    it('modo required: rechaza el fichaje sin ubicación (400)', async () => {
      await setGeo('required');
      expect((await checkIn({})).statusCode).toBe(400);
    });

    it('guarda las coordenadas y marca dentro de la geocerca', async () => {
      await setGeo('required', { lat: MADRID.lat, lng: MADRID.lng, r: 100 });
      const res = await checkIn({ lat: MADRID.lat, lng: MADRID.lng });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.check_in_lat).toBeCloseTo(MADRID.lat, 3);
      expect(body.check_in_outside).toBe(false);
    });

    it('marca el fichaje fuera de la geocerca', async () => {
      await setGeo('optional', { lat: MADRID.lat, lng: MADRID.lng, r: 100 });
      const res = await checkIn({ lat: LEJOS.lat, lng: LEJOS.lng });
      expect(res.json().check_in_outside).toBe(true);
    });

    it('modo optional: permite fichar sin ubicación', async () => {
      await setGeo('optional');
      const res = await checkIn({});
      expect(res.statusCode).toBe(201);
      expect(res.json().check_in_lat).toBeNull();
    });
  });
});
