import { api } from './client';

const API_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';
const KIOSK_KEY = 'kiosk_token';

export interface KioskPunchResult {
  action: 'check_in' | 'check_out';
  employee_name: string;
  time: string;
}

export const kioskService = {
  // El admin (sesión normal) activa el dispositivo y obtiene el token de kiosco.
  createToken: (): Promise<{ token: string }> => api.post<{ token: string }>('/kiosk/token'),

  getStoredToken: (): string | null => localStorage.getItem(KIOSK_KEY),
  setStoredToken: (t: string): void => localStorage.setItem(KIOSK_KEY, t),
  clearToken: (): void => localStorage.removeItem(KIOSK_KEY),

  // Fichaje con el token de kiosco (no el del usuario).
  punch: async (code: string): Promise<KioskPunchResult> => {
    const token = localStorage.getItem(KIOSK_KEY);
    const res = await fetch(`${API_URL}/kiosk/punch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token ?? ''}` },
      body: JSON.stringify({ code }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? 'Error al fichar';
      throw new Error(msg);
    }
    return data as KioskPunchResult;
  },
};
