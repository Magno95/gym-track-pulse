import { useSyncExternalStore, useState } from "react";
import { getSyncQueue, subscribeToSync, processQueue } from "@/lib/localCache";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { hasLegacyPendingChanges } from "@/lib/legacyChanges";

export function SyncStatus() {
  const { userId } = useAuth();
  const queue = useSyncExternalStore(subscribeToSync, getSyncQueue);
  const [retrying, setRetrying] = useState(false);
  const [legacyPending] = useState(hasLegacyPendingChanges);
  const client = useQueryClient();
  if (!userId) return null;
  const changeCount = queue.filter((op) => op.type !== "delete_image").length;
  const failed = queue.find((op) => op.lastError);
  if (!changeCount && !failed && !legacyPending) return null;
  const retry = async () => {
    setRetrying(true);
    try { await processQueue({ force: true }); await client.invalidateQueries(); }
    catch { toast.error("Could not access pending changes. Please try again."); }
    finally { setRetrying(false); }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ userId, operations: queue }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "gym-track-pending-changes.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div role="status" className="border-b bg-muted px-4 py-2 text-sm flex flex-wrap items-center justify-center gap-3">
    {legacyPending && <span className="w-full text-center">Older pending changes are preserved on this device. Account verification is needed to recover them.</span>}
    {(changeCount > 0 || failed) && <span>{changeCount ? `${changeCount} changes saved on this device, awaiting sync.` : "Image cleanup pending."}{failed && " Synchronization failed; your changes are retained."}</span>}
    {failed && <span className="w-full text-center text-xs">{failed.failureKind === "validation"
      ? "Correct the pending session values, then retry. You can export your changes for recovery."
      : failed.failureKind === "auth" ? "Sign in again with this account, then retry." : "Check your connection, then retry."}</span>}
    {queue.length > 0 && <>
      <Button size="sm" variant="outline" disabled={retrying} onClick={() => void retry()}>Retry sync</Button>
      <Button size="sm" variant="ghost" onClick={download}>Export pending changes</Button>
    </>}
  </div>;
}
