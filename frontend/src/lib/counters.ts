// Bus de suscripción para los contadores del admin (badges del sidebar).
// Permite que cualquier acción que mute datos (validar un fichaje, aprobar
// horas extra, descartar una notificación…) refresque los contadores al
// instante, sin esperar al polling.

type Listener = () => void;

const listeners = new Set<Listener>();

/** Notifica que los datos que alimentan los contadores admin han cambiado. */
export function notifyCountersChanged(): void {
  listeners.forEach((l) => l());
}

/** Suscribe un listener; devuelve la función para desuscribirse. */
export function subscribeCounters(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
