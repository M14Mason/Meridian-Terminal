// The only way the app talks to the proxy. Adds the device token, maps errors.
import { PROXY_URL } from '../config';

const TOKEN_KEY = 'meridian.deviceToken';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked (private mode). The device will need to pair again next visit.
  }
  window.dispatchEvent(new Event('meridian:auth'));
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  if (!PROXY_URL) throw new ApiError(0, 'proxy not configured');
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  const token = getToken();
  if (init.auth !== false && token) headers.authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(PROXY_URL.replace(/\/$/, '') + path, {
      method: init.method ?? 'GET',
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'network error');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    // A revoked or unknown token drops the device back to the pairing screen.
    if (res.status === 401 && init.auth !== false) setToken(null);
    throw new ApiError(res.status, data.error ?? `HTTP ${res.status}`);
  }
  return data;
}

export function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Browser';
}
