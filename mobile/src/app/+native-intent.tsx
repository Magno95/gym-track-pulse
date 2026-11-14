export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const url = new URL(path, 'gymtrack://app');
    if (url.protocol === 'gymtrack:' && url.pathname === '/strava-callback') return `/strava-callback${url.search}`;
  } catch { /* Let Expo Router handle ordinary paths. */ }
  return path;
}
