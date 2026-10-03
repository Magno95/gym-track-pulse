// The old queue has no owner. Expose only its presence, never its contents to a signed-in account.
export function hasLegacyPendingChanges(): boolean {
  try {
    const raw = localStorage.getItem("gym-tracker-sync-queue");
    if (!raw) return false;
    const value: unknown = JSON.parse(raw);
    return !Array.isArray(value) || value.length > 0;
  } catch {
    // Unreadable legacy data stays untouched and requires recovery as well.
    return true;
  }
}
