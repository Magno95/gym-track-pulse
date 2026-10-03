import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthContext } from "@/lib/authContext";
import { getCurrentUserId, setCurrentUserId } from "@/lib/authSession";
import { initSyncQueue } from "@/lib/localCache";
import { toast } from "sonner";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState({ userId: null as string | null, loading: true, error: null as string | null });
  useEffect(() => {
    let active = true; let generation = 0;
    const changeUser = (userId: string | null) => {
      if (!active) return;
      if (getCurrentUserId() !== userId) {
        setCurrentUserId(userId);
        void queryClient.cancelQueries(); queryClient.clear();
      }
      setState({ userId, loading: false, error: null });
      void initSyncQueue(userId).catch(() => toast.error("Impossibile aprire le modifiche locali. Non chiudere il browser e riprova."));
    };
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      generation++; changeUser(session?.user.id ?? null);
    });
    const initialGeneration = generation;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || generation !== initialGeneration) return;
      if (error) throw error;
      changeUser(data.session?.user.id ?? null);
    }).catch((error: unknown) => {
      if (active && generation === initialGeneration) {
        setCurrentUserId(null);
        void queryClient.cancelQueries(); queryClient.clear();
        setState({ userId: null, loading: false, error: error instanceof Error ? error.message : "Unable to check your session." });
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [queryClient]);
  // Reset forms and dialog state as well as queries when the account changes.
  return <AuthContext.Provider value={state}><Fragment key={state.userId ?? "anonymous"}>{children}</Fragment></AuthContext.Provider>;
}
