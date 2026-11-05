import { supabase } from "@/integrations/supabase/client";
import { requireUserId } from "./authSession";

export { mapStravaExercise } from "../../supabase/functions/_shared/stravaWorkout";
import type { ImportedStravaActivity } from "../../supabase/functions/_shared/stravaActivity";
export type { ImportedStravaActivity, StravaActivitySummary } from "../../supabase/functions/_shared/stravaActivity";
export interface StravaPublication {
  status: "uploading" | "processing" | "published" | "failed" | "uncertain";
  activityId: string | null;
  canCheck: boolean;
  error: string | null;
}
export interface StravaStatus {
  configured: boolean;
  connected: boolean;
  canReadActivities: boolean;
  importedActivity: ImportedStravaActivity | null;
  publication: StravaPublication | null;
}

export async function stravaRequest<T>(userId: string, body: Record<string, unknown>): Promise<T> {
  requireUserId(userId);
  const { data: session, error: authError } = await supabase.auth.getSession();
  if (authError || session.session?.user.id !== userId) throw new Error("Accedi nuovamente per utilizzare Strava.");
  requireUserId(userId);
  const { data, error } = await supabase.functions.invoke("strava", { body });
  requireUserId(userId);
  if (error) {
    let message = "Impossibile contattare Strava. Controlla la connessione e la configurazione del servizio.";
    if (error.context instanceof Response) {
      try { const detail = await error.context.json(); if (typeof detail.error === "string") message = detail.error; } catch { /* Non-JSON gateway response. */ }
    }
    throw new Error(message);
  }
  return data as T;
}
