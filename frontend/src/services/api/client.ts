const API_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';
const TOKEN_KEY = 'auth_token';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export const tokenStorage = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string): void => localStorage.setItem(TOKEN_KEY, token),
  clear: (): void => localStorage.removeItem(TOKEN_KEY),
};

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const token = tokenStorage.get();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // respuesta sin cuerpo JSON
  }

  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(
      err?.message ?? `Error ${res.status}`,
      err?.code ?? 'UNKNOWN',
      res.status
    );
  }

  return data as T;
}

/** Descarga binaria/texto (p. ej. CSV); no parsea JSON. */
async function requestBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = tokenStorage.get();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_URL}${path}`, { method: 'GET', headers });
  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = `Error ${res.status}`;
    try {
      const err = (await res.json())?.error;
      if (err?.code) code = err.code;
      if (err?.message) message = err.message;
    } catch {
      // sin cuerpo JSON
    }
    throw new ApiError(message, code, res.status);
  }
  return res.blob();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
  getBlob: (path: string) => requestBlob(path),
};
