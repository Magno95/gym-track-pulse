import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Ruler, Scale, UserRound } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FloatingNavigation } from "@/components/FloatingNavigation";
import { isProfileSchemaMissing, useProfile } from "@/hooks/useProfile";
import { findBodyWeight, todayLocal } from "@/lib/bodyweight";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const dateLabel = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export default function Profile() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, history, saveHeight, saveWeight, userId } = useProfile();
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(todayLocal);
  const [weightError, setWeightError] = useState("");
  const [visibleMeasurements, setVisibleMeasurements] = useState(30);
  const measurements = history.data ?? [];
  const schemaMissing = isProfileSchemaMissing(profile.error) || isProfileSchemaMissing(history.error);
  const currentWeight = findBodyWeight(measurements, todayLocal());
  const firstWeight = measurements[0]?.weight_kg;
  const change = currentWeight !== null && firstWeight !== undefined ? Math.round((currentWeight - firstWeight) * 100) / 100 : null;
  const chartData = measurements.slice(-300).map((entry) => ({ date: entry.effective_date, time: new Date(`${entry.effective_date}T12:00:00`).getTime(), weight: Number(entry.weight_kg) }));
  const last = chartData[chartData.length - 1];
  if (last && last.date < todayLocal()) chartData.push({ ...last, date: todayLocal(), time: new Date(`${todayLocal()}T12:00:00`).getTime() });

  useEffect(() => { setHeight(profile.data?.height_cm?.toString() ?? ""); }, [profile.data?.height_cm]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) { toast.error("Could not sign out"); return; }
    queryClient.clear();
    navigate("/auth");
  };

  return <div className="floating-page min-h-screen bg-background">
    <header className="sticky top-0 z-10 border-b border-border/50 bg-background/95 backdrop-blur-sm">
      <div className="container mx-auto flex max-w-2xl items-center gap-3 px-4 py-4">
        <Button asChild variant="ghost" size="icon"><Link to="/" aria-label="Back to exercises"><ArrowLeft className="h-5 w-5" /></Link></Button>
        <h1 className="flex-1 text-xl font-bold">Profile</h1>
        <Button variant="ghost" size="icon" aria-label="Sign out" onClick={signOut}><LogOut className="h-5 w-5" /></Button>
      </div>
    </header>
    <main className="container mx-auto max-w-2xl space-y-6 px-4 py-6">
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><UserRound className="h-7 w-7" /></div>
        <div><h2 className="text-2xl font-bold tracking-tight">Your progress</h2><p className="text-sm text-muted-foreground">A little more context for every workout.</p></div>
      </div>
      {(profile.isError || history.isError) && <p role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{schemaMissing ? "Profile setup is pending. Apply the profile/bodyweight database migration to enable measurements." : "Could not refresh your profile. Check your connection and try again."}<Button variant="link" className="px-2" onClick={() => { profile.refetch(); history.refetch(); }}>Retry</Button></p>}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-primary/15 bg-gradient-to-br from-primary/10 to-card p-5">
          <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Scale className="h-4 w-4 text-primary" />Current weight</div>
          <p className="text-3xl font-bold tracking-tight tabular-nums">{currentWeight ?? "—"}<span className="ml-1 text-sm font-normal text-muted-foreground">kg</span></p>
          <p className="mt-2 text-xs text-muted-foreground">{change !== null && measurements.length > 1 ? `${change > 0 ? "+" : ""}${change} kg since your first entry` : "Your latest measurement"}</p>
        </Card>
        <Card className="p-5"><div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><Ruler className="h-4 w-4 text-primary" />Height</div><p className="text-3xl font-bold tracking-tight tabular-nums">{profile.data?.height_cm ?? "—"}<span className="ml-1 text-sm font-normal text-muted-foreground">cm</span></p><p className="mt-2 text-xs text-muted-foreground">Your profile measurement</p></Card>
      </div>

      <Card className="space-y-5 p-5 sm:p-6">
        <div><h2 className="font-semibold">Weight over time</h2><p className="mt-1 text-sm text-muted-foreground">Each weight applies from its date until the next entry.</p>{measurements.length > 300 && <p className="mt-1 text-xs text-muted-foreground">The chart shows your latest 300 measurements. Your full history is available below.</p>}</div>
        {history.isLoading || !userId ? <p className="py-10 text-center text-muted-foreground">Loading measurements...</p> : chartData.length === 0 ?
          <div className="rounded-xl border border-dashed py-10 text-center"><Scale className="mx-auto mb-3 h-7 w-7 text-muted-foreground/50" /><p className="text-sm text-muted-foreground">Add your first weight to start your chart.</p></div> :
          <div className="h-56" role="img" aria-label="Body weight over time. Measurements are also listed below.">
            <ResponsiveContainer width="100%" height="100%"><LineChart data={chartData} margin={{ top: 12, right: 12, left: -16, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="time" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={(value: number) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" })} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} minTickGap={30} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
              <Tooltip labelFormatter={(value) => new Date(Number(value)).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} formatter={(value) => [`${value ?? "—"} kg`, "Weight"]} contentStyle={{ borderRadius: 12, background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
              <Line type="stepAfter" dataKey="weight" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--card))", strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </LineChart></ResponsiveContainer>
          </div>}
      </Card>

      <Card className="p-5 sm:p-6">
        <h2 className="mb-4 font-semibold">Log your weight</h2>
        <form className="space-y-4" onSubmit={(event) => {
          event.preventDefault(); setWeightError("");
          saveWeight.mutate({ weight: Number(weight), date }, { onSuccess: () => setWeight(""), onError: (error) => setWeightError(error.message) });
        }}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="profile-weight">Weight (kg)</Label><Input id="profile-weight" name="weight" type="number" inputMode="decimal" step="0.1" min="0.1" max="1000" required placeholder={currentWeight?.toString() ?? "e.g. 75.5"} value={weight} onChange={(event) => { setWeight(event.target.value); setWeightError(""); }} className="h-12 text-base" /></div>
            <div className="space-y-2"><Label htmlFor="weight-date">Applies from</Label><Input id="weight-date" name="effective_date" type="date" required max={todayLocal()} value={date} onChange={(event) => setDate(event.target.value)} className="h-12 text-base" /></div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">One entry per day. Saving again on the same date corrects that entry. Already logged sessions keep their original body weight and added load.</p>
          {weightError && <p role="alert" className="text-sm text-destructive">{weightError}</p>}
          <Button type="submit" disabled={!userId || schemaMissing || saveWeight.isPending} className="h-11 w-full sm:w-auto">{saveWeight.isPending ? "Saving..." : "Save weight"}</Button>
        </form>
      </Card>
      <Card className="p-5 sm:p-6"><h2 className="mb-4 font-semibold">Height</h2>
        <form className="flex items-end gap-3" onSubmit={(event) => { event.preventDefault(); saveHeight.mutate(Number(height)); }}>
          <div className="flex-1 space-y-2"><Label htmlFor="profile-height">Height (cm)</Label><Input id="profile-height" name="height" type="number" inputMode="decimal" step="0.1" min="0.1" max="300" required value={height} onChange={(event) => setHeight(event.target.value)} placeholder="e.g. 175" className="h-12 text-base" /></div>
          <Button type="submit" disabled={!userId || schemaMissing || saveHeight.isPending} className="h-12">{saveHeight.isPending ? "Saving..." : "Save height"}</Button>
        </form>
      </Card>
      {measurements.length > 0 && <Card className="overflow-hidden"><div className="px-5 pt-5"><h2 className="font-semibold">Measurements</h2></div>
        <table className="mt-3 w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="px-5 py-3 font-medium">Applies from</th><th className="px-5 py-3 text-right font-medium">Weight</th></tr></thead><tbody>{measurements.slice(-visibleMeasurements).reverse().map((entry) => <tr key={entry.id} className="border-t border-border/50"><td className="px-5 py-3">{dateLabel(entry.effective_date)}</td><td className="px-5 py-3 text-right font-medium tabular-nums">{entry.weight_kg} kg</td></tr>)}</tbody></table>
        {measurements.length > visibleMeasurements && <div className="p-4 text-center"><Button variant="outline" onClick={() => setVisibleMeasurements((count) => count + 30)}>Show older measurements</Button></div>}
      </Card>}
    </main>
    <FloatingNavigation />
  </div>;
}
