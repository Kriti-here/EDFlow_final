// Shared API base resolution for every frontend service.
// VITE_API_BASE_URL is inlined at build time (see .env.production.example) and
// may or may not end in "/", so it is normalised here exactly once.

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

/** Backend base URL with any trailing slashes removed, so paths never double up. */
export const API_BASE = RAW_BASE.replace(/\/+$/, '');

/**
 * Absolute URL for a backend path, optionally with query parameters.
 * Keeps every service building requests the same way.
 */
export function apiUrl(path: string, query?: Record<string, string | number>): string {
  const url = `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, String(value));
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}
