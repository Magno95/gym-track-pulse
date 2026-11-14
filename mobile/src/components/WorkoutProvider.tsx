import { useCallback, useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { AppState } from 'react-native';
import { WorkoutContext } from '../workout';
import { useAuth } from '../auth';
import { outbox } from '../data/native-store';
import { fetchState, executeOperation } from '../data/remote';
import { synchronize } from '../data/synchronize';
import type { Change } from '../data/model';
import { imageCache, remoteImageSource } from '../image-cache';
import { exerciseImage } from '../exercise-images';

export function WorkoutProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const owner = session!.user.id;
  useSyncExternalStore(outbox.subscribe, outbox.version);
  const [online, setOnline] = useState(false);
  const [networkKnown, setNetworkKnown] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [controller] = useState(() => new AbortController());
  useEffect(() => () => controller.abort(), [controller]);
  useEffect(() => NetInfo.addEventListener((state) => { setOnline(state.isConnected === true && state.isInternetReachable !== false); setNetworkKnown(true); }), []);
  const data = outbox.state(owner);
  const pending = outbox.pending(owner);
  // Warm the entire library, including rows not mounted by the virtualized list.
  const imageUrls = JSON.stringify([...new Set(data.exercises.map((exercise) => remoteImageSource(exerciseImage(exercise))?.uri)
    .filter((url): url is string => !!url))].sort());
  useEffect(() => {
    if (!online) return;
    let active = true;
    void imageCache.prefetch(JSON.parse(imageUrls) as string[], () => active);
    return () => { active = false; };
  }, [online, imageUrls, owner]);
  const query = useQuery({ queryKey: ['workouts', owner], enabled: online, retry: 1, staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const version = outbox.version();
      const remote = await fetchState(owner, signal);
      outbox.snapshot(remote, version);
      return remote.updatedAt;
    } });
  const { refetch } = query;
  const runSync = useCallback(async (force = false) => {
    if (!online || controller.signal.aborted) return;
    setSyncing(true); setSyncError(null);
    try {
      const hadPending = outbox.pending(owner).length > 0;
      await synchronize(outbox, owner, (operation) => executeOperation(operation, controller.signal), force);
      if (hadPending && !outbox.pending(owner).some((op) => op.change.type !== 'delete_image') && !controller.signal.aborted) await refetch();
    } catch (error) { if (!controller.signal.aborted) setSyncError(error instanceof Error ? error.message : 'Sincronizzazione non riuscita.'); }
    finally { if (!controller.signal.aborted) setSyncing(false); }
  }, [online, controller, owner, refetch]);
  useEffect(() => {
    void runSync();
    const timer = setInterval(() => void runSync(), 15_000);
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void runSync(); });
    return () => { clearInterval(timer); listener.remove(); };
  }, [runSync]);
  const enqueue = useCallback((change: Change) => {
    outbox.enqueue(owner, change, randomUUID());
    void runSync();
  }, [owner, runSync]);
  return <WorkoutContext.Provider value={{ data, pending, online, syncing, enqueue,
    loading: !data.updatedAt && (!networkKnown || (online && query.isPending)),
    error: syncError ?? pending.find((operation) => operation.error)?.error ?? (query.isError ? 'Aggiornamento non riuscito. I dati salvati su questo iPhone restano disponibili.' : null),
    retry: async () => { await runSync(true); await query.refetch(); },
  }}>{children}</WorkoutContext.Provider>;
}
