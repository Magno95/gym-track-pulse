/** Restrict OAuth hand-off to the app callback, never arbitrary browser URLs. */
export function nativeStravaReturn(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol === 'gymtrack:' && (url.hostname === 'strava-callback' && !url.pathname || url.pathname === '/strava-callback')) return url;
    if ((url.protocol === 'exp:' || url.protocol === 'exps:') && url.hostname && url.pathname === '/--/strava-callback') return url;
  } catch { /* Invalid URLs are never used as redirect destinations. */ }
  return null;
}
export function nativeStravaHandoff(params: URLSearchParams): string | null {
  const target = nativeStravaReturn(params.get('native_return'));
  if (!target || !/^[a-f0-9]{64}$/.test(params.get('state') ?? '')) return null;
  for (const key of ['state', 'code', 'scope', 'error']) {
    const value = params.get(key);
    if (value && value.length <= 2048) target.searchParams.set(key, value);
  }
  return target.href;
}
