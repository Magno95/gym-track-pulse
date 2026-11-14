import { useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { AuthContext } from '../auth';
import { getSupabase, authStorageKey } from '../supabase';
import { setActiveOwner } from '../data/identity';
import NetInfo from '@react-native-community/netinfo';
import { offlineSession } from '../data/offline-session';

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const client = getSupabase();
    let active = true;
    let authEventReceived = false;
    let networkKnown = false;
    let online = true;
    let initialNull = false;
    let signedOut = false;
    let validEvent = false;
    const cached = localStorage.getItem(authStorageKey);
    function apply(next: Session | null) {
      if (active) { setActiveOwner(next?.user.id ?? null); setSession(next); setLoading(false); setError(null); }
    }
    setLoading(true);
    setError(null);
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      authEventReceived = true;
      if (event === 'SIGNED_OUT') signedOut = true;
      if (next) { signedOut = false; validEvent = true; initialNull = false; }
      if (event === 'SIGNED_OUT') validEvent = false;
      if (event === 'INITIAL_SESSION' && !next) {
        if (validEvent) return;
        initialNull = true;
        if (!networkKnown) return;
        apply(signedOut ? null : offlineSession(cached, online));
      } else apply(next);
    });
    void NetInfo.fetch().then((network) => {
      if (!active) return;
      online = network.isConnected !== false && network.isInternetReachable !== false;
      networkKnown = true;
      if (validEvent || signedOut) return;
      const restored = signedOut ? null : offlineSession(cached, online);
      if (restored) apply(restored);
      else if (initialNull) apply(null);
    }).catch(() => { networkKnown = true; if (initialNull && !validEvent && !signedOut) apply(null); });
    void client.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || authEventReceived) return;
      const restored = signedOut ? null : offlineSession(cached, online);
      if (sessionError && !restored) setError('Non riusciamo a ripristinare il tuo accesso. Riprova.');
      else apply(data.session ?? restored);
      setLoading(false);
    }).catch(() => {
      if (active && !authEventReceived) { setError('Non riusciamo a ripristinare il tuo accesso. Riprova.'); setLoading(false); }
    });
    const refresh = (state: string | null | undefined) => {
      focusManager.setFocused(state === 'active');
      if (state === 'active') client.auth.startAutoRefresh();
      else client.auth.stopAutoRefresh();
    };
    refresh(AppState.currentState);
    const listener = AppState.addEventListener('change', refresh);
    return () => { active = false; subscription.unsubscribe(); listener.remove(); client.auth.stopAutoRefresh(); };
  }, [attempt]);

  return <AuthContext.Provider value={{ session, loading, error, retry: () => setAttempt((value) => value + 1) }}>{children}</AuthContext.Provider>;
}
