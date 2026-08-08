/**
 * utils/apiClient.ts — fetch-based API client for the self-hosted Fastify backend.
 *
 * Replaces the Supabase client (utils/supabase.ts). Zero runtime dependencies.
 *
 * - Base URL: `import.meta.env.VITE_API_URL` (default `/api` — same-origin via
 *   endowpdf's nginx `/api/` location).
 * - Tokens: localStorage keys `fill.accessToken` / `fill.refreshToken`.
 * - Auth state: module-level `currentUser` + subscriber list exposed through
 *   `subscribeToAuth` / `getCurrentUser` / `setSession` / `clearSession`
 *   (an onAuthStateChange-compatible minimal API for the store/pages).
 * - 401 → single-flight refresh via POST /auth/refresh; concurrent callers
 *   share one refresh; the original request is retried exactly once.
 *   On refresh failure the session is cleared and the user is redirected
 *   to /auth.
 * - Access-token expiry pre-check via the JWT `exp` claim so requests with an
 *   already-expired token refresh before spending a pointless 401 round-trip.
 * - `ApiError` mirrors the Supabase error shape `{ message, code, details,
 *   hint }` so existing callers that normalize with utils/supabaseError
 *   (`toError`) keep working unchanged.
 */

import { appFullUrl } from './paths';

// ── Constants ────────────────────────────────────────────────────────────────

const ACCESS_TOKEN_KEY = 'fill.accessToken';
const REFRESH_TOKEN_KEY = 'fill.refreshToken';
const USER_KEY = 'fill.user';
/** Clock-drift / latency allowance for the access-token expiry pre-check. */
const TOKEN_EXPIRY_SKEW_MS = 30_000;

/** Trailing-slash-normalized API base (VITE_API_URL or same-origin /api). */
export const API_BASE_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'
).replace(/\/+$/, '');

/** Absolute path of the auth page, aware of the /fill/ deployment base. */
const AUTH_ROUTE = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/auth`;

// ── Types ────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ApiRequestOptions {
  method?: HttpMethod;
  /** JSON-serializable request body (ignored when `formData` is set). */
  body?: unknown;
  /** Multipart upload body — the browser sets the Content-Type boundary. */
  formData?: FormData;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Skip the Authorization header and 401 refresh handling (public routes). */
  skipAuth?: boolean;
  /** Internal — set when retrying a request after a token refresh. */
  retried?: boolean;
}

/** User shape returned by /auth/me — mirrors the `profiles` row + auth data. */
export interface ApiUser {
  id: string;
  email?: string;
  full_name?: string | null;
  avatar_url?: string | null;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface ApiSession {
  accessToken: string;
  refreshToken: string;
  user: ApiUser | null;
  /** Epoch ms when the access token expires (undefined when not decodable). */
  expiresAt?: number;
}

/**
 * JSON-error object shared by every apiClient failure. Shape-compatible with
 * Supabase errors so `toError()` from utils/supabaseError keeps working:
 * it returns Error instances as-is and falls back to message/details/hint.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  readonly hint?: string;

  constructor(
    message: string,
    status = 0,
    code = 'request_failed',
    options?: { details?: unknown; hint?: string }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.hint = options?.hint;
  }
}

export type AuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED';

export type AuthChangeListener = (
  event: AuthChangeEvent,
  session: ApiSession | null
) => void;

/** Return shape of `subscribeToAuth` — matches Supabase's onAuthStateChange. */
export interface AuthSubscription {
  data: { subscription: { unsubscribe(): void } };
}

// ── Storage helpers ──────────────────────────────────────────────────────────

function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.warn(`[apiClient] localStorage read failed for "${key}"`, err);
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`[apiClient] localStorage write failed for "${key}"`, err);
  }
}

function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[apiClient] localStorage removal failed for "${key}"`, err);
  }
}

export function getAccessToken(): string | null {
  return storageGet(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return storageGet(REFRESH_TOKEN_KEY);
}

// ── Session state ────────────────────────────────────────────────────────────

const listeners = new Set<AuthChangeListener>();

let currentUser: ApiUser | null = hydrateUser();

/** Restore the cached user from localStorage at module load (fast bootstrap). */
function hydrateUser(): ApiUser | null {
  const raw = storageGet(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ApiUser;
    return parsed && typeof parsed === 'object' && typeof parsed.id === 'string'
      ? parsed
      : null;
  } catch (err) {
    console.warn('[apiClient] failed to parse cached user, ignoring', err);
    storageRemove(USER_KEY);
    return null;
  }
}

export function getCurrentUser(): ApiUser | null {
  return currentUser;
}

function setCurrentUser(user: ApiUser | null): void {
  currentUser = user;
  if (user) storageSet(USER_KEY, JSON.stringify(user));
  else storageRemove(USER_KEY);
}

function buildSessionFromStorage(): ApiSession | null {
  const accessToken = getAccessToken();
  const refreshToken = getRefreshToken();
  if (!accessToken || !refreshToken) return null;
  return {
    accessToken,
    refreshToken,
    user: currentUser,
    expiresAt: getTokenExpiryMs(accessToken) ?? undefined,
  };
}

function notify(event: AuthChangeEvent, session: ApiSession | null): void {
  for (const listener of listeners) {
    try {
      listener(event, session);
    } catch (err) {
      console.warn('[apiClient] auth subscriber threw', err);
    }
  }
}

/**
 * Subscribe to auth state changes. Fires an immediate `INITIAL_SESSION` event
 * with the current session (Supabase-compatible), then `SIGNED_IN`,
 * `SIGNED_OUT`, or `TOKEN_REFRESHED` as state changes.
 */
export function subscribeToAuth(listener: AuthChangeListener): AuthSubscription {
  listeners.add(listener);
  const subscription = {
    unsubscribe(): void {
      listeners.delete(listener);
    },
  };
  notify('INITIAL_SESSION', buildSessionFromStorage());
  return { data: { subscription } };
}

/**
 * Replace the whole session (tokens + user) and notify subscribers.
 * `event` defaults to SIGNED_IN; pass `null` to clear the session.
 */
export function setSession(
  session: ApiSession | null,
  event: AuthChangeEvent = session ? 'SIGNED_IN' : 'SIGNED_OUT'
): void {
  if (!session) {
    clearSession({ redirect: false });
    return;
  }
  storageSet(ACCESS_TOKEN_KEY, session.accessToken);
  storageSet(REFRESH_TOKEN_KEY, session.refreshToken);
  // Keep the existing cached user when the payload omits one (e.g. refresh).
  if (session.user) setCurrentUser(session.user);
  notify(event, session);
}

export interface ClearSessionOptions {
  /** Redirect to /auth after clearing. Only the refresh-failure path sets this. */
  redirect?: boolean;
}

/** Remove tokens + user, notify SIGNED_OUT. */
export function clearSession(options?: ClearSessionOptions): void {
  storageRemove(ACCESS_TOKEN_KEY);
  storageRemove(REFRESH_TOKEN_KEY);
  setCurrentUser(null);
  notify('SIGNED_OUT', null);
  if (options?.redirect === true) sessionExpiredHandler();
}

// ── Session-expired redirect (injectable for SPA router navigation / tests) ──

let sessionExpiredHandler: () => void = defaultSessionExpiredRedirect;

/** Override where a session-expiry redirect goes (e.g. React Router navigate). */
export function setSessionExpiredHandler(handler: (() => void) | null): void {
  sessionExpiredHandler = handler ?? defaultSessionExpiredRedirect;
}

function defaultSessionExpiredRedirect(): void {
  try {
    if (window.location.pathname.endsWith('/auth')) return;
    window.location.assign(`${window.location.origin}${AUTH_ROUTE}`);
  } catch (err) {
    console.warn('[apiClient] unable to redirect to auth page', err);
  }
}

// ── JWT helpers ──────────────────────────────────────────────────────────────

/** Decode a base64url segment to text (UTF-8 safe). */
function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Epoch ms when a JWT expires, or null when the token is not decodable. */
export function getTokenExpiryMs(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const parsed = JSON.parse(decodeBase64Url(payload)) as { exp?: unknown };
    return typeof parsed.exp === 'number' && Number.isFinite(parsed.exp)
      ? parsed.exp * 1000
      : null;
  } catch (err) {
    console.warn('[apiClient] failed to decode token expiry', err);
    return null;
  }
}

function isAccessTokenExpired(token: string): boolean {
  const expiry = getTokenExpiryMs(token);
  return expiry !== null && expiry <= Date.now() + TOKEN_EXPIRY_SKEW_MS;
}

// ── Single-flight token refresh ──────────────────────────────────────────────

let refreshPromise: Promise<boolean> | null = null;

/**
 * Refresh the access token via POST /auth/refresh. Concurrent callers share
 * one in-flight request; on failure the session is cleared and the user is
 * redirected to /auth.
 */
async function refreshTokens(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function performRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    clearSession({ redirect: true });
    return false;
  }
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      clearSession({ redirect: true });
      return false;
    }
    const payload = (await response.json()) as AuthResponsePayload;
    const session = normalizeSession(payload);
    if (!session) {
      clearSession({ redirect: true });
      return false;
    }
    setSession(session, 'TOKEN_REFRESHED');
    return true;
  } catch (err) {
    console.warn('[apiClient] token refresh failed', err);
    clearSession({ redirect: true });
    return false;
  }
}

// ── Core fetch ───────────────────────────────────────────────────────────────

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function toApiError(response: Response, payload: unknown): ApiError {
  const record = (payload ?? {}) as Record<string, unknown>;
  const message =
    firstString(record.message, record.error) ??
    (response.statusText || `Request failed (${response.status})`);
  const code = firstString(record.code, record.error) ?? `http_${response.status}`;
  return new ApiError(message, response.status, code, {
    details: record.details,
    hint: firstString(record.hint),
  });
}

/**
 * Perform a JSON request against the backend.
 *
 * - Attaches `Authorization: Bearer <accessToken>` when a token exists
 *   (unless `skipAuth`).
 * - Refreshes before sending when the access token is already expired.
 * - On 401 (authenticated request only): single-flight refresh, then retries
 *   the original request exactly once. A failed refresh clears the session
 *   and redirects to /auth.
 * - Non-2xx responses throw an `ApiError` (Supabase-shaped for toError()).
 */
export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    formData,
    headers,
    signal,
    skipAuth = false,
    retried = false,
  } = options;

  const token = getAccessToken();
  const requestHeaders: Record<string, string> = { ...headers };
  if (!formData && body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }
  if (token && !skipAuth) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  // Pre-check: the access token is already expired, so refresh before
  // spending a guaranteed-failing 401 round-trip.
  if (token && !skipAuth && !retried && isAccessTokenExpired(token)) {
    const refreshed = await refreshTokens();
    if (!refreshed) {
      throw new ApiError(
        'Session expired. Please sign in again.',
        401,
        'session_expired'
      );
    }
    const freshToken = getAccessToken();
    if (freshToken) requestHeaders.Authorization = `Bearer ${freshToken}`;
  }

  const requestBody = formData ?? (body !== undefined ? JSON.stringify(body) : undefined);

  let response: Response;
  try {
    response = await fetch(buildUrl(path), {
      method,
      headers: requestHeaders,
      body: requestBody,
      signal,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : 'Network request failed';
    throw new ApiError(message, 0, 'network_error');
  }

  const payload = await parseResponseBody(response);
  if (response.ok) return payload as T;

  const apiError = toApiError(response, payload);

  // 401 while authenticated → single-flight refresh → retry exactly once.
  if (response.status === 401 && token && !skipAuth && !retried) {
    const refreshed = await refreshTokens();
    if (!refreshed) throw apiError;
    return apiFetch<T>(path, { ...options, retried: true });
  }

  throw apiError;
}

// ── Typed request helpers ────────────────────────────────────────────────────

export const api = {
  get: <T>(path: string, options?: ApiRequestOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: 'POST', body }),

  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: 'PUT', body }),

  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T>(path: string, options?: ApiRequestOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: 'DELETE' }),

  /** Multipart upload — sends `formData` as the request body. */
  upload: <T>(path: string, formData: FormData, options?: ApiRequestOptions): Promise<T> =>
    apiFetch<T>(path, { ...options, method: 'POST', formData }),
};

// ── Auth API ─────────────────────────────────────────────────────────────────

/** Defensive union of the shapes the backend may return for auth endpoints. */
interface AuthResponsePayload {
  accessToken?: unknown;
  access_token?: unknown;
  refreshToken?: unknown;
  refresh_token?: unknown;
  token?: unknown;
  user?: ApiUser | null;
  session?: {
    accessToken?: unknown;
    refreshToken?: unknown;
    user?: ApiUser | null;
  };
}

/** Build an ApiSession from an auth payload, tolerating snake/camel variants. */
function normalizeSession(payload: AuthResponsePayload): ApiSession | null {
  const accessToken = firstString(
    payload.accessToken,
    payload.access_token,
    payload.token,
    payload.session?.accessToken
  );
  const refreshToken = firstString(
    payload.refreshToken,
    payload.refresh_token,
    payload.session?.refreshToken
  );
  if (!accessToken || !refreshToken) return null;
  const user = payload.user ?? payload.session?.user ?? currentUser;
  return {
    accessToken,
    refreshToken,
    user: user ?? null,
    expiresAt: getTokenExpiryMs(accessToken) ?? undefined,
  };
}

function applyAuthResponse(payload: AuthResponsePayload): {
  user: ApiUser | null;
  session: ApiSession | null;
} {
  const session = normalizeSession(payload);
  if (session) {
    setSession(session, 'SIGNED_IN');
    return { user: session.user, session };
  }
  // No tokens yet (e.g. signup awaiting email confirmation) — cache user only.
  if (payload.user) setCurrentUser(payload.user);
  return { user: getCurrentUser(), session: null };
}

function buildOAuthUrl(redirectTo: string): string {
  const separator = API_BASE_URL.includes('?') ? '&' : '?';
  return `${API_BASE_URL}/auth/oauth/google/authorize${separator}redirect=${encodeURIComponent(redirectTo)}`;
}

export const authApi = {
  /** Register a new account. Throws ApiError on failure. */
  async signUp(
    email: string,
    password: string
  ): Promise<{ user: ApiUser | null; session: ApiSession | null }> {
    const payload = await api.post<AuthResponsePayload>(
      '/auth/signup',
      { email, password },
      { skipAuth: true }
    );
    return applyAuthResponse(payload ?? {});
  },

  /** Email + password sign-in. Throws ApiError on failure. */
  async signInWithPassword(
    email: string,
    password: string
  ): Promise<{ user: ApiUser | null; session: ApiSession | null }> {
    const payload = await api.post<AuthResponsePayload>(
      '/auth/login',
      { email, password },
      { skipAuth: true }
    );
    return applyAuthResponse(payload ?? {});
  },

  /**
   * Sign out: best-effort server-side revocation, then clear the local
   * session. Does NOT redirect — the calling page owns navigation.
   */
  async signOut(): Promise<void> {
    const token = getAccessToken();
    if (token) {
      try {
        await fetch(buildUrl('/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (err) {
        console.warn('[apiClient] logout request failed (local session still cleared)', err);
      }
    }
    clearSession({ redirect: false });
  },

  /** Current session from storage (Supabase-shaped: { data: { session } }). */
  async getSession(): Promise<{ data: { session: ApiSession | null } }> {
    return { data: { session: buildSessionFromStorage() } };
  },

  /**
   * Current user — cached in module state; falls back to GET /auth/me on a
   * cold start. Supabase-shaped: { data: { user } }.
   */
  async getUser(): Promise<{ data: { user: ApiUser | null } }> {
    if (!getAccessToken()) return { data: { user: null } };
    if (currentUser) return { data: { user: currentUser } };
    try {
      const payload = await api.get<AuthResponsePayload>('/auth/me');
      if (payload?.user) setCurrentUser(payload.user);
      return { data: { user: payload?.user ?? null } };
    } catch (err) {
      console.warn('[apiClient] /auth/me failed', err);
      return { data: { user: null } };
    }
  },

  /** Force a token refresh (single-flight). Returns the new session or null. */
  async refreshSession(): Promise<ApiSession | null> {
    const refreshed = await refreshTokens();
    return refreshed ? buildSessionFromStorage() : null;
  },

  /**
   * Google OAuth via the server-side redirect flow: the backend builds the
   * Google URL and 302s; the browser navigates there, then lands back on
   * `redirectTo` (default /fill/home) with a session established server-side.
   */
  signInWithGoogle(redirectTo: string = appFullUrl('/home')): void {
    window.location.assign(buildOAuthUrl(redirectTo));
  },
};
