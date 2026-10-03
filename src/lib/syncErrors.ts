export function syncFailureKind(error: unknown): "validation" | "auth" | "temporary" {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["AUTH_CHANGED", "42501", "PGRST301", "PGRST302", "PGRST303"].includes(code)) return "auth";
  if (["23502", "23503", "23514", "22P02", "22003", "22007", "22008"].includes(code)) return "validation";
  return "temporary";
}
