import { useQuery } from "@tanstack/react-query";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { stravaRequest } from "@/lib/strava";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { nativeStravaHandoff } from "@/lib/nativeOAuth";

export default function StravaCallback() {
  const [params] = useSearchParams();
  const target = nativeStravaHandoff(params);
  return target ? <NativeReturn target={target} /> : <ProtectedRoute><WebStravaCallback /></ProtectedRoute>;
}

function NativeReturn({ target }: { target: string }) {
  useEffect(() => {
    // No access tokens or web session are transferred. The native client completes
    // the single-use code exchange with its own authenticated GymTrack account.
    window.history.replaceState(null, "", "/strava/callback");
    window.location.replace(target);
  }, [target]);
  return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
    <p role="status">Torniamo a GymTrack per completare il collegamento.</p>
    <Button asChild><a href={target}>Apri GymTrack</a></Button>
  </div>;
}

function WebStravaCallback() {
  const { userId } = useAuth();
  const [params] = useSearchParams();
  const state = params.get("state");
  // Cached by state: a remount must not exchange a single-use OAuth code twice.
  const result = useQuery({ queryKey: ["strava-callback", userId, state], enabled: !!userId,
    retry: false, staleTime: Infinity, gcTime: 10 * 60_000, refetchOnWindowFocus: false,
    queryFn: () => stravaRequest<{ date: string | null; result: string }>(userId!, { action: "callback", state,
      code: params.get("code"), scope: params.get("scope"), error: params.get("error") }),
  });
  if (result.data?.date) return <Navigate replace to={`/session/${result.data.date}?strava=${encodeURIComponent(result.data.result)}`} />;
  return <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
    {result.isError || result.data ? <>
      <p role="alert">{result.error?.message ?? "Il collegamento è scaduto o appartiene a un altro account GymTrack."} Riapri la sessione e ripeti il collegamento a Strava.</p>
      <Button asChild><a href="/">Torna alle sessioni</a></Button>
    </> : <p role="status">Collegamento a Strava in corso…</p>}
  </div>;
}
