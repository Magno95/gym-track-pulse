import { Link } from "react-router-dom";

export function BodyweightSummary({ weight, loading = false }: { weight: number | null; loading?: boolean }) {
  return <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm" aria-live="polite">
    {weight !== null ? <>
      <p className="font-medium">Body weight: <span className="text-primary">{weight} kg</span></p>
      <p className="mt-1 text-xs text-muted-foreground">Load = body weight + added weight for each set.</p>
    </> : loading ? <p className="text-muted-foreground">Loading profile weight...</p> : <>
      <p className="font-medium">No profile weight is available for this date.</p>
      <Link to="/profile" className="mt-1 inline-block text-primary underline underline-offset-4">Add a weight measurement in Profile</Link>
    </>}
  </div>;
}
