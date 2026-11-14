import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { getSupabase } from './supabase';
import { requireOwner } from './data/identity';

export interface StravaPublication { status: 'uploading' | 'processing' | 'published' | 'failed' | 'uncertain'; activityId: string | null; canCheck: boolean; error: string | null }
export interface StravaStatus { configured: boolean; connected: boolean; publication: StravaPublication | null }
export async function stravaRequest<T>(owner: string, body: Record<string, unknown>): Promise<T> {
  requireOwner(owner);
  const { data: auth, error: authError } = await getSupabase().auth.getSession();
  if (authError || auth.session?.user.id !== owner) throw new Error('Accedi di nuovo per utilizzare Strava.');
  const { data, error } = await getSupabase().functions.invoke('strava', { body });
  requireOwner(owner);
  if (error) {
    let message = 'Strava non è disponibile. Controlla la connessione e riprova.';
    if (error.context instanceof Response) {
      try { const detail = await error.context.json(); if (typeof detail.error === 'string') message = detail.error; } catch { /* Gateway may not return JSON. */ }
    }
    throw new Error(message);
  }
  return data as T;
}

const callbacks = new Map<string, Promise<{ date: string | null; result: string }>>();
export function completeStrava(owner: string, url: string) {
  requireOwner(owner);
  const params = new URL(url).searchParams;
  const state = params.get('state');
  const saved = JSON.parse(localStorage.getItem(`strava-oauth:${owner}`) ?? 'null') as { state: string; created: number } | null;
  const key = `${owner}:${state}`;
  const existing = callbacks.get(key);
  if (existing) return existing;
  if (!saved || state !== saved.state || Date.now() - saved.created > 10 * 60_000) throw new Error('Il collegamento è scaduto o appartiene a un altro account. Riprova.');
  const result = stravaRequest<{ date: string | null; result: string }>(owner, { action: 'callback', state, code: params.get('code'), scope: params.get('scope'), error: params.get('error') });
  callbacks.set(key, result);
  setTimeout(() => callbacks.delete(key), 10 * 60_000);
  return result;
}
export async function connectStrava(owner: string, date: string) {
  const { url } = await stravaRequest<{ url: string }>(owner, { action: 'connect', date });
  const authorize = new URL(url);
  if (authorize.origin !== 'https://www.strava.com') throw new Error('Indirizzo di autorizzazione non valido.');
  // The mobile flow only uploads app-recorded workouts; no activity read permission is needed.
  authorize.searchParams.set('scope', 'activity:write');
  const callback = new URL(authorize.searchParams.get('redirect_uri')!);
  const localReturn = Linking.createURL('strava-callback');
  // Standalone iPhone builds can return directly using the registered app scheme,
  // while preserving Strava's registered callback domain. Expo Go uses the web bridge.
  const returnTo = localReturn.startsWith('gymtrack:') ? `gymtrack://${callback.host}/strava-callback` : localReturn;
  if (returnTo.startsWith('gymtrack:')) authorize.searchParams.set('redirect_uri', returnTo);
  else { callback.searchParams.set('native_return', returnTo); authorize.searchParams.set('redirect_uri', callback.href); }
  localStorage.setItem(`strava-oauth:${owner}`, JSON.stringify({ state: authorize.searchParams.get('state'), created: Date.now() }));
  const result = await WebBrowser.openAuthSessionAsync(authorize.href, returnTo);
  requireOwner(owner);
  return result.type === 'success' ? completeStrava(owner, result.url) : null;
}
