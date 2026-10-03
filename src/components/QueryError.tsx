import { Button } from "@/components/ui/button";
export function QueryError({ onRetry }: { onRetry: () => void }) {
  return <div role="alert" className="rounded-lg border border-destructive/40 p-4 space-y-3">
    <p>Unable to load the latest data. Check your connection and try again.</p>
    <Button variant="outline" onClick={onRetry}>Try again</Button>
  </div>;
}
