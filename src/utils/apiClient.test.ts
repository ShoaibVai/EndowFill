/**
 * utils/apiClient.test.ts — unit tests for the fetch-based API client.
 *
 * Covers the acceptance-critical behavior: Bearer attachment, single-flight
 * 401 refresh with concurrent callers, retry-once semantics, expiry pre-check,
 * refresh-failure cleanup + redirect, error normalization (toError parity),
 * multipart upload, and auth API flows. fetch is mocked via vi.stubGlobal.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  API_BASE_URL,
  ApiError,
  api,
  authApi,
  clearSession,
  getAccessToken,
  getCurrentUser,
  getRefreshToken,
  getTokenExpiryMs,
  setSession,
  setSessionExpiredHandler,
  subscribeToAuth,
} from './apiClient';
import type { ApiSession } from './apiClient';
import { toError } from './supabaseError';

const TEST_USER = { id: 'user-1', email: 'a@b.com' };
const SESSION: ApiSession = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  user: TEST_USER,
};

/** Build a fake JWT whose payload carries the given `exp` (epoch seconds). */
function makeToken(expEpochSec: number): string {
  const encode = (obj: object): string =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ exp: expEpochSec })}.sig`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  clearSession({ redirect: false });
  setSessionExpiredHandler(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('request handling', () => {
  it('attaches the Bearer access token and returns parsed JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    setSession(SESSION);

    const result = await api.get<{ ok: boolean }>('/workspaces');

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/workspaces');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer access-1' });
  });

  it('does not attach the Authorization header when skipAuth is set', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    setSession(SESSION);

    await api.post('/auth/login', { email: 'a@b.com', password: 'pw' }, { skipAuth: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('sends multipart form data without a JSON content-type', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: 'https://cdn/x.pdf' }));
    setSession(SESSION);

    const formData = new FormData();
    formData.append('file', new Blob(['abc'], { type: 'application/pdf' }), 'x.pdf');

    const result = await api.upload<{ url: string }>('/files', formData);

    expect(result.url).toBe('https://cdn/x.pdf');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(formData);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('wraps network failures as ApiError with code network_error', async () => {
    setSession(SESSION);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(api.get('/x')).rejects.toMatchObject({
      status: 0,
      code: 'network_error',
    });
  });
});

describe('single-flight 401 refresh + retry', () => {
  it('refreshes once for concurrent 401s and retries both requests with the new token', async () => {
    setSession({ ...SESSION, accessToken: 'expired-access' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired', code: 'token_expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired', code: 'token_expired' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh', user: TEST_USER })
      )
      .mockResolvedValueOnce(jsonResponse(200, { a: 1 }))
      .mockResolvedValueOnce(jsonResponse(200, { b: 2 }));

    const [r1, r2] = await Promise.all([
      api.get<{ a: number }>('/x'),
      api.get<{ b: number }>('/y'),
    ]);

    expect(r1).toEqual({ a: 1 });
    expect(r2).toEqual({ b: 2 });
    // 2 original 401s + 1 shared refresh + 2 retries.
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[2][0]).toBe('/api/auth/refresh');
    const retryHeaders = fetchMock.mock.calls.slice(3).map((call) => (call[1] as RequestInit).headers);
    expect(retryHeaders[0]).toMatchObject({ Authorization: 'Bearer new-access' });
    expect(retryHeaders[1]).toMatchObject({ Authorization: 'Bearer new-access' });
    expect(getAccessToken()).toBe('new-access');
    expect(getRefreshToken()).toBe('new-refresh');
  });

  it('clears the session and redirects when the refresh fails', async () => {
    setSession({ ...SESSION, accessToken: 'expired-access' });
    const events: string[] = [];
    const subscription = subscribeToAuth((event) => {
      events.push(event);
    });
    const redirectSpy = vi.fn();
    setSessionExpiredHandler(redirectSpy);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'refresh token expired' }));

    await expect(api.get('/x')).rejects.toBeInstanceOf(ApiError);

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getCurrentUser()).toBeNull();
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(events).toContain('SIGNED_OUT');
    subscription.data.subscription.unsubscribe();
  });

  it('does not loop when the retried request is still 401', async () => {
    setSession({ ...SESSION, accessToken: 'expired-access' });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, { message: 'expired' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'new-refresh', user: TEST_USER })
      )
      .mockResolvedValueOnce(jsonResponse(401, { message: 'still unauthorized' }));

    await expect(api.get('/x')).rejects.toMatchObject({
      status: 401,
      message: 'still unauthorized',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not refresh or clear for skipAuth 401s (e.g. wrong password)', async () => {
    setSession(SESSION);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'invalid credentials' }));

    await expect(authApi.signInWithPassword('a@b.com', 'wrong-password')).rejects.toMatchObject({
      status: 401,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBe('access-1');
    expect(getCurrentUser()).toEqual(TEST_USER);
  });
});

describe('access-token expiry pre-check', () => {
  it('refreshes before sending when the token is already expired (no 401 round-trip)', async () => {
    const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 60);
    setSession({ ...SESSION, accessToken: expiredToken });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'fresh', refreshToken: 'fresh-refresh', user: TEST_USER })
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: 42 }));

    const result = await api.get<{ data: number }>('/x');

    expect(result).toEqual({ data: 42 });
    expect(fetchMock).toHaveBeenCalledTimes(2); // refresh + request, no 401 involved
    expect(fetchMock.mock.calls[1][0]).toBe('/api/x');
    expect((fetchMock.mock.calls[1][1] as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer fresh',
    });
  });

  it('does not pre-refresh while the token is still valid', async () => {
    const validToken = makeToken(Math.floor(Date.now() / 1000) + 3600);
    setSession({ ...SESSION, accessToken: validToken });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { fine: true }));

    await api.get('/x');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/x');
  });

  it('throws session_expired and clears the session when the pre-check refresh fails', async () => {
    const expiredToken = makeToken(Math.floor(Date.now() / 1000) - 60);
    setSession({ ...SESSION, accessToken: expiredToken });
    const redirectSpy = vi.fn();
    setSessionExpiredHandler(redirectSpy);
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { message: 'refresh token expired' }));

    await expect(api.get('/x')).rejects.toMatchObject({
      status: 401,
      code: 'session_expired',
    });
    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
  });

  it('decodes JWT exp for expiry checks', () => {
    const exp = Math.floor(Date.now() / 1000) + 300;
    expect(getTokenExpiryMs(makeToken(exp))).toBe(exp * 1000);
    expect(getTokenExpiryMs('not-a-jwt')).toBeNull();
  });
});

describe('error normalization', () => {
  it('maps JSON error bodies to ApiError with status/code/message/details/hint', async () => {
    setSession(SESSION);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, {
        message: 'Not found',
        code: 'not_found',
        details: 'row missing',
        hint: 'check the id',
      })
    );

    const err = await api.get('/missing').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toBeInstanceOf(Error);
    const apiErr = err as ApiError;
    expect(apiErr.status).toBe(404);
    expect(apiErr.code).toBe('not_found');
    expect(apiErr.message).toBe('Not found');
    expect(apiErr.details).toBe('row missing');
    expect(apiErr.hint).toBe('check the id');
    // supabaseError parity: toError() returns Error instances untouched.
    expect(toError(apiErr)).toBe(apiErr);
  });

  it('falls back to statusText when the body has no message', async () => {
    setSession(SESSION);
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));

    await expect(api.get('/boom')).rejects.toMatchObject({
      status: 500,
      code: 'http_500',
    });
  });
});

describe('auth API', () => {
  it('signInWithPassword stores tokens + user and notifies SIGNED_IN', async () => {
    const accessToken = makeToken(Math.floor(Date.now() / 1000) + 3600);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { accessToken, refreshToken: 'rt-1', user: TEST_USER })
    );
    const events: string[] = [];
    const subscription = subscribeToAuth((event, session) => {
      events.push(`${event}:${session ? session.accessToken : 'none'}`);
    });

    const result = await authApi.signInWithPassword('a@b.com', 'password123');

    expect(result.session?.accessToken).toBe(accessToken);
    expect(getAccessToken()).toBe(accessToken);
    expect(getRefreshToken()).toBe('rt-1');
    expect(getCurrentUser()).toEqual(TEST_USER);
    expect(events).toContain(`SIGNED_IN:${accessToken}`);
    subscription.data.subscription.unsubscribe();
  });

  it('signUp without tokens keeps the user for the pending-confirmation flow', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: TEST_USER }));

    const result = await authApi.signUp('a@b.com', 'password123');

    expect(result.session).toBeNull();
    expect(result.user).toEqual(TEST_USER);
    expect(getCurrentUser()).toEqual(TEST_USER);
    expect(getAccessToken()).toBeNull();
  });

  it('signOut clears everything and does not redirect', async () => {
    setSession(SESSION);
    const redirectSpy = vi.fn();
    setSessionExpiredHandler(redirectSpy);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const events: string[] = [];
    const subscription = subscribeToAuth((event) => {
      events.push(event);
    });

    await authApi.signOut();

    expect(getAccessToken()).toBeNull();
    expect(getRefreshToken()).toBeNull();
    expect(getCurrentUser()).toBeNull();
    expect(events).toContain('SIGNED_OUT');
    expect(redirectSpy).not.toHaveBeenCalled();
    subscription.data.subscription.unsubscribe();
  });

  it('getSession reflects the stored tokens', async () => {
    setSession(SESSION);

    const { data } = await authApi.getSession();

    expect(data.session).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      user: TEST_USER,
      expiresAt: undefined,
    });
  });

  it('getUser returns the cached user without a network call', async () => {
    setSession(SESSION);

    const { data } = await authApi.getUser();

    expect(data.user).toEqual(TEST_USER);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('getUser without a session returns null without a network call', async () => {
    const { data } = await authApi.getUser();

    expect(data.user).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('base URL', () => {
  it('reads VITE_API_URL (trailing slash normalized) via a fresh module instance', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/v1/');
    vi.resetModules();

    const mod = await import('./apiClient');

    expect(mod.API_BASE_URL).toBe('https://api.example.test/v1');
  });

  it('defaults to /api when VITE_API_URL is not set', () => {
    expect(API_BASE_URL).toBe('/api');
  });
});
