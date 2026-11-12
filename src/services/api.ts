// Shared API base resolution and JSON helpers for every frontend service.
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

/** Origin the app is currently talking to (used in error messages only). */
function baseOrigin(): string {
  return API_BASE || (typeof window !== 'undefined' ? window.location.origin : 'this origin');
}

/** Typed error carrying the HTTP status and the path that failed. */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

const NOT_JSON_HINT =
  `the API at "${baseOrigin()}" returned an HTML page instead of JSON. ` +
  `Set VITE_API_BASE_URL to the backend origin (for example http://localhost:8000) and restart the dev server.`;

/**
 * FastAPI's `detail` is a string for `HTTPException("...")` but an object for
 * `HTTPException({"message": ..., "problems": [...]})`. Flatten both to text so
 * validation problems reach the user instead of "[object Object]".
 */
function describeDetail(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const record = value as { message?: unknown; problems?: unknown };
    const message = typeof record.message === 'string' ? record.message : null;
    const problems = Array.isArray(record.problems) ? record.problems.map(String) : [];
    if (message && problems.length > 0) return `${message}: ${problems.join('; ')}`;
    if (message) return message;
    return JSON.stringify(value);
  }
  return String(value);
}

/** Turn a non-2xx response into an ApiError, preferring FastAPI's "detail". */
async function toError(res: Response, path: string): Promise<ApiError> {
  const text = await res.text().catch(() => '');
  let detail = text;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; message?: unknown };
    detail = describeDetail(parsed.detail) ?? describeDetail(parsed.message) ?? text;
  } catch {
    // non-JSON body (HTML / plain text) — keep the raw text
  }
  const trimmed = String(detail ?? '').trim().slice(0, 300);
  return new ApiError(
    `${res.status} ${res.statusText} on ${path}${trimmed ? ` — ${trimmed}` : ''}`,
    res.status,
    path,
  );
}

/** fetch() wrapper that converts a network failure into a readable ApiError. */
async function request(url: string, init: RequestInit | undefined, path: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new ApiError(
      `cannot reach the EDFlow API at "${baseOrigin()}" (${path}). Is the backend running?`,
      0,
      path,
    );
  }
}

/** Message for a body read that failed after the headers had already arrived. */
function unreadableBodyMessage(path: string): string {
  return (
    `the connection to "${baseOrigin()}" dropped while reading the response for ${path}. ` +
    `The request may have reached the backend — retry.`
  );
}

/**
 * Read a response body as text, converting a mid-stream failure into a readable
 * ApiError. A connection dropped after the headers arrived (backend restart or a
 * proxy reset) rejects with the native `TypeError: Failed to fetch`; without this
 * guard that raw string escapes to the page instead of a friendly message.
 */
async function readText(res: Response, path: string): Promise<string> {
  try {
    return await res.text();
  } catch {
    throw new ApiError(unreadableBodyMessage(path), res.status, path);
  }
}

/** Read a response body as JSON, guarding both the read and the parse. */
async function readJson<T>(res: Response, path: string): Promise<T> {
  const text = await readText(res, path);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(`expected JSON from ${path} but the body was not valid JSON`, res.status, path);
  }
}

export interface JsonOptions {
  query?: Record<string, string | number>;
  init?: RequestInit;
}

/**
 * GET a backend path and parse it as JSON.
 *
 * Guards against the classic misconfiguration where the base URL points at the
 * static host: the response is HTML with a 200, which would otherwise surface as
 * `Unexpected token '<' ... is not valid JSON`. Here it becomes a clear ApiError.
 */
export async function fetchJson<T>(path: string, options: JsonOptions = {}): Promise<T> {
  const res = await request(apiUrl(path, options.query), options.init, path);
  if (!res.ok) throw await toError(res, path);

  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await readText(res, path);
    if (text.trimStart().startsWith('<')) {
      throw new ApiError(NOT_JSON_HINT, res.status, path);
    }
    throw new ApiError(
      `expected JSON from ${path} but received "${contentType || 'an unknown content type'}"`,
      res.status,
      path,
    );
  }
  return await readJson<T>(res, path);
}

/** POST a JSON body to a backend path and parse the JSON response. */
export async function postJson<T>(
  path: string,
  body?: unknown,
  options: JsonOptions = {},
): Promise<T> {
  return fetchJson<T>(path, {
    query: options.query,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      ...options.init,
    },
  });
}

/** PUT a JSON body to a backend path and parse the JSON response. */
export async function putJson<T>(
  path: string,
  body?: unknown,
  options: JsonOptions = {},
): Promise<T> {
  return fetchJson<T>(path, {
    query: options.query,
    init: {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      ...options.init,
    },
  });
}

/** POST multipart/form-data (file uploads) and parse the JSON response. */
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  return fetchJson<T>(path, { init: { method: 'POST', body: form } });
}

/** Human-readable message for any thrown value, used by page error states. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** One settled request outcome: the value, or a readable error message. */
export interface Settled<T> {
  data: T | null;
  error: string | null;
}

/**
 * Reduce a single `Promise.allSettled` outcome to value-or-error.
 *
 * Lets a service keep the data from the requests that succeeded while reporting
 * the one that failed, instead of `Promise.all` rejecting the whole load on the
 * first failure and hiding the successful responses.
 */
export function settleResult<T>(outcome: PromiseSettledResult<T>): Settled<T> {
  if (outcome.status === 'fulfilled') return { data: outcome.value, error: null };
  return { data: null, error: errorMessage(outcome.reason) };
}
