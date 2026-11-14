import 'expo-sqlite/localStorage/install';
import { createClient, processLock } from '@supabase/supabase-js';
import type { Database } from '../../src/integrations/supabase/types';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
// Explicitly retain Supabase's existing default so installed users stay signed in.
export const authStorageKey = url ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : 'gymtrack-auth';

export const supabase = url && key && !key.startsWith('sb_secret_')
  ? createClient<Database>(url, key, {
    global: { fetch: async (input, init) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (init?.signal?.aborted) controller.abort();
      init?.signal?.addEventListener('abort', abort);
      const timer = setTimeout(abort, 25_000);
      try { return await fetch(input, { ...init, signal: controller.signal }); }
      finally { clearTimeout(timer); init?.signal?.removeEventListener('abort', abort); }
    } },
    auth: { storageKey: authStorageKey, storage: localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, lock: processLock },
  }) : null;

export function getSupabase() {
  if (!supabase) throw new Error('Configurazione di GymTrack non disponibile.');
  return supabase;
}
