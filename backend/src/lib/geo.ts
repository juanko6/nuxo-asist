/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // radio terrestre en metros
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface Geofence {
  lat: number;
  lng: number;
  radius_m: number;
}

/**
 * ¿Está la coordenada FUERA de la geocerca? null si no hay geocerca o coords.
 */
export function outsideGeofence(
  lat: number | null | undefined,
  lng: number | null | undefined,
  fence: Geofence | null
): boolean | null {
  if (fence === null || lat == null || lng == null) return null;
  return distanceMeters(lat, lng, fence.lat, fence.lng) > fence.radius_m;
}
