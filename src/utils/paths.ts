/**
 * paths.ts — URL helpers for the /fill/ sub-path deployment.
 *
 * EndowFill is served same-origin under endowpdf's nginx at the Vite
 * `base` path (default `/fill/`). Absolute URLs that leave the SPA
 * (OAuth redirects, shareable invite links) must include that prefix.
 */

/**
 * Build an app-absolute URL under the deployment base path.
 * `appUrl('/home')` → `/fill/home` when base is `/fill/`.
 */
export function appUrl(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (!base) return path.startsWith('/') ? path : `/${path}`;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Build a full origin-absolute URL (for OAuth redirects / shared links).
 * `appFullUrl('/invite/abc')` → `https://host/fill/invite/abc`.
 */
export function appFullUrl(path: string): string {
  return `${window.location.origin}${appUrl(path)}`;
}
