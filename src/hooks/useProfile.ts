import { useAuth } from "./useAuth";
import { readAllPages } from "@/lib/pagination";
import { requireUserId } from "@/lib/authSession";
import { isCalendarDate } from "@/lib/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";
import { todayLocal } from "@/lib/bodyweight";
import { toast } from "sonner";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Measurement = Database["public"]["Tables"]["body_weight_history"]["Row"];

export function isProfileSchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return ["PGRST205", "PGRST204", "42P01"].includes(String(error.code));
}

const retryProfileRead = (failureCount: number, error: unknown) => !isProfileSchemaMissing(error) && failureCount < 2;

function readCache<T>(key: string): T | undefined {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? undefined; }
  catch { return undefined; }
}

function writeCache(key: string, data: unknown) {
  try { localStorage.setItem(key, JSON.stringify(data)); }
  catch { /* Storage may be unavailable; the server remains the source of truth. */ }
}

export function useProfile({ enabled = true, loadProfile = true }: { enabled?: boolean; loadProfile?: boolean } = {}) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();

  const profileKey = ["profile", userId];
  const historyKey = ["weight-history", userId];
  const profileCacheKey = `gym-track-profile:${userId}`;
  const historyCacheKey = `gym-track-weight-history:${userId}`;

  const profile = useQuery({
    queryKey: profileKey,
    enabled: !!userId && enabled && loadProfile,
    initialData: () => userId ? readCache<Profile | null>(profileCacheKey) : undefined,
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId!).maybeSingle();
      if (error) throw error;
      requireUserId(userId);
      writeCache(profileCacheKey, data);
      return data;
    },
    retry: retryProfileRead,
    staleTime: 60_000,
  });

  const history = useQuery({
    queryKey: historyKey,
    enabled: !!userId && enabled,
    initialData: () => userId ? readCache<Measurement[]>(historyCacheKey) : undefined,
    initialDataUpdatedAt: 0,
    queryFn: async () => {
      const data = await readAllPages((from, to) => supabase.from("body_weight_history").select("*")
        .eq("user_id", userId!).order("effective_date").order("id").range(from, to));
      requireUserId(userId);
      writeCache(historyCacheKey, data);
      return data;
    },
    retry: retryProfileRead,
    staleTime: 60_000,
  });

  const saveHeight = useMutation({
    mutationFn: async (height: number) => {
      requireUserId(userId);
      if (!Number.isFinite(height) || height <= 0 || height > 300) throw new Error("Enter a height between 0 and 300 cm.");
      const { data, error } = await supabase.from("profiles")
        .upsert({ user_id: userId!, height_cm: height }).select().single();
      if (error) throw error;
      requireUserId(userId);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(profileKey, data);
      writeCache(profileCacheKey, data);
      toast.success("Height saved");
    },
    onError: () => toast.error("Could not save your height. Please try again."),
  });

  const saveWeight = useMutation({
    mutationFn: async ({ weight, date }: { weight: number; date: string }) => {
      requireUserId(userId);
      if (!Number.isFinite(weight) || weight <= 0 || weight > 1000 || !isCalendarDate(date) || date > todayLocal()) {
        throw new Error("Enter a valid weight and a date up to today.");
      }
      const { data, error } = await supabase.from("body_weight_history")
        .upsert({ user_id: userId!, weight_kg: weight, effective_date: date }, { onConflict: "user_id,effective_date" })
        .select().single();
      if (error) throw error;
      requireUserId(userId);
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<Measurement[]>(historyKey, (previous = []) => {
        const next = [...previous.filter((entry) => entry.effective_date !== data.effective_date), data]
          .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
        writeCache(historyCacheKey, next);
        return next;
      });
      toast.success("Weight saved. Existing sessions keep their original load.");
    },
    onError: () => toast.error("Could not save your weight. Please try again."),
  });

  return { profile, history, saveHeight, saveWeight, userId };
}
