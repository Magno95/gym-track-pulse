import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { readQueryCache } from "@/lib/queryCache";
import { getCurrentUserId } from "@/lib/authSession";

export function useCachedQuery<T>(key: readonly unknown[], userId: string | null) {
  const client = useQueryClient(); const serialized = JSON.stringify(key);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    const queryKey = JSON.parse(serialized) as unknown[];
    void readQueryCache<T>(queryKey, userId).then((entry) => {
      if (active && entry && getCurrentUserId() === userId && client.getQueryData(queryKey) === undefined) {
        client.setQueryData(queryKey, entry.data, { updatedAt: entry.updatedAt });
      }
    }).catch(() => {});
    return () => { active = false; };
  }, [client, serialized, userId]);
}
