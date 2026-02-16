import { useEffect, useRef, useCallback } from "react";
import { processQueue, hasPendingChanges } from "@/lib/localCache";
import { useQueryClient } from "@tanstack/react-query";
import { EXERCISES_QUERY_KEY } from "./useExercises";

const SYNC_INTERVAL = 60 * 1000; // 1 minute

export function useSyncManager() {
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);

  const flushSync = useCallback(async () => {
    if (syncingRef.current || !hasPendingChanges()) return;
    syncingRef.current = true;
    try {
      await processQueue();
      // After sync, refetch from DB to reconcile IDs
      if (!hasPendingChanges()) {
        queryClient.invalidateQueries({ queryKey: EXERCISES_QUERY_KEY });
      }
    } finally {
      syncingRef.current = false;
    }
  }, [queryClient]);

  useEffect(() => {
    // Periodic sync every minute
    const interval = setInterval(flushSync, SYNC_INTERVAL);

    // Sync when tab becomes hidden
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        flushSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    // Process any pending ops from previous session
    flushSync();

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [flushSync]);

  return { flushSync };
}
