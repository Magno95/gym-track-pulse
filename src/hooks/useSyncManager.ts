import { useEffect, useCallback, useRef } from "react";
import { processQueue, hasPendingChanges, subscribeToSync, getSyncQueue } from "@/lib/localCache";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export function useSyncManager() {
  const client = useQueryClient(); const { userId } = useAuth();
  const flushing = useRef(false);
  const refresh = useCallback(() => Promise.all(["exercises", "exercise", "session-history", "day-session"].map((key) =>
    client.invalidateQueries({ queryKey: [key, userId] }))), [client, userId]);
  const flushSync = useCallback(async () => {
    if (!userId || flushing.current || !hasPendingChanges()) return;
    flushing.current = true;
    try {
      const before = getSyncQueue().map((op) => `${op.id}:${op.version}`).join("|");
      await processQueue();
      const after = getSyncQueue().map((op) => `${op.id}:${op.version}`).join("|");
      if (before !== after) await refresh();
    } catch { toast.error("Could not access your pending changes. Retry synchronization."); }
    finally { flushing.current = false; }
  }, [refresh, userId]);
  useEffect(() => {
    if (!userId) return;
    let previous = getSyncQueue();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      const queue = getSyncQueue();
      const acknowledged = previous.some((op) => !queue.some((current) => current.id === op.id));
      previous = queue;
      // An acknowledgement from another tab also refreshes this tab's server data.
      if (acknowledged && !flushing.current) {
        clearTimeout(timer); timer = setTimeout(() => void refresh(), 300);
      }
      void flushSync();
    };
    const interval = setInterval(() => void flushSync(), 30_000);
    const online = () => void flushSync();
    const visibility = () => { if (document.visibilityState === "visible") void flushSync(); };
    const unsubscribe = subscribeToSync(changed);
    window.addEventListener("online", online); document.addEventListener("visibilitychange", visibility);
    void flushSync();
    return () => { clearInterval(interval); clearTimeout(timer); unsubscribe(); window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visibility); };
  }, [flushSync, refresh, userId]);
  return { flushSync };
}
