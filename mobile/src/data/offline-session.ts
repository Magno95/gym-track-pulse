import type { Session } from '@supabase/supabase-js';

/** Restore local access only while offline; server authorization still uses the SDK. */
export function offlineSession(raw: string | null, online: boolean): Session | null {
  if (online || !raw) return null;
  try {
    const value = JSON.parse(raw) as Session;
    return value && typeof value.access_token === 'string' && typeof value.refresh_token === 'string'
      && typeof value.user?.id === 'string' && value.user.id ? value : null;
  } catch { return null; }
}
