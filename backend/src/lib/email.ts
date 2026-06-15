import type { AppConfig } from '../config.js';

export interface AbsenceEmail {
  email: string;
  name: string;
  date: string; // 'YYYY-MM-DD'
}

/**
 * Punto de envío de correo (seam). Hoy es un stub: el aviso efectivo de ausencia
 * es la notificación in-app. El envío real por SMTP (nodemailer) se conectará
 * aquí más adelante, sin tocar la lógica de detección que ya lo invoca.
 * Devuelve true solo si el correo se envió de verdad.
 */
export async function sendAbsenceEmail(
  config: AppConfig,
  _payload: AbsenceEmail
): Promise<boolean> {
  if (!config.emailEnabled) return false;
  // TODO(fase7): integrar nodemailer + SMTP y enviar el aviso con botón
  // "Justificar ausencia". De momento no hay transporte configurado.
  return false;
}
