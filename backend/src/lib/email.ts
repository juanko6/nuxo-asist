import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config.js';

export interface AbsenceEmail {
  email: string;
  name: string;
  date: string; // 'YYYY-MM-DD'
  /** URL del botón "Justificar ausencia" (la app del empleado). */
  justifyUrl?: string;
}

let cached: Transporter | null = null;

/** Transporte SMTP a partir de la config; null si el email está deshabilitado. */
function getTransport(config: AppConfig): Transporter | null {
  if (!config.emailEnabled || !config.smtpHost) return null;
  if (!cached) {
    cached = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpSecure,
      auth: config.smtpUser
        ? { user: config.smtpUser, pass: config.smtpPass }
        : undefined,
    });
  }
  return cached;
}

/**
 * Envía el aviso de ausencia injustificada (HU-01) por SMTP. Best-effort: si el
 * email está deshabilitado o no hay transporte, devuelve false sin lanzar (el
 * aviso in-app sigue siendo el canal efectivo). `transport` se inyecta en tests.
 */
export async function sendAbsenceEmail(
  config: AppConfig,
  payload: AbsenceEmail,
  transport?: Transporter | null
): Promise<boolean> {
  const t = transport !== undefined ? transport : getTransport(config);
  if (!t) return false;

  const justify = payload.justifyUrl ?? '#';
  await t.sendMail({
    from: config.smtpFrom,
    to: payload.email,
    subject: 'Ausencia sin justificar',
    text:
      `Hola ${payload.name},\n\n` +
      `Se registra una ausencia el día ${payload.date} sin que conste un día de ` +
      `vacaciones o baja. Si no es correcto, contacta con tu responsable para justificarla.\n\n` +
      `Justificar: ${justify}\n`,
    html:
      `<p>Hola ${payload.name},</p>` +
      `<p>Se registra una ausencia el día <strong>${payload.date}</strong> sin que conste ` +
      `un día de vacaciones o baja. Si no es correcto, contacta con tu responsable.</p>` +
      `<p><a href="${justify}" ` +
      `style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;` +
      `border-radius:8px;text-decoration:none">Justificar ausencia</a></p>`,
  });
  return true;
}
