import type { SessionSet } from "./bodyweight";

export function isCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
export function validateSession(session: { date: string; sets: SessionSet[] }, multiplier = 1) {
  if (!isCalendarDate(session.date)) throw new Error("Enter a valid date.");
  if (!Number.isFinite(multiplier) || multiplier < 1 || multiplier > 5) throw new Error("Multiplier must be between 1 and 5.");
  if (!session.sets.length || session.sets.length > 100) throw new Error("Enter between 1 and 100 sets.");
  for (const set of session.sets) {
    if (!Number.isInteger(set.reps) || set.reps < 1 || set.reps > 10000 || !Number.isFinite(set.weight) || set.weight < 0 || set.weight > 100000) {
      throw new Error("Enter whole repetitions between 1 and 10000, and a load between 0 and 100000.");
    }
    if (set.body_weight !== undefined || set.additional_weight !== undefined) {
      if (!Number.isFinite(set.body_weight) || set.body_weight! < 0.01 || set.body_weight! > 1000 || !Number.isFinite(set.additional_weight)
        || set.additional_weight! < 0 || set.additional_weight! > 100000 || Math.abs(set.weight - Math.round((set.body_weight! + set.additional_weight!) * 100) / 100) > 0.005) {
        throw new Error("The bodyweight snapshot and added load must match the total load.");
      }
    }
    if (set.duration_seconds !== undefined && (!Number.isInteger(set.duration_seconds) || set.duration_seconds !== set.reps
      || set.body_weight === undefined || set.additional_weight === undefined)) {
      throw new Error("Timed bodyweight sets must preserve their duration and bodyweight snapshot.");
    }
  }
}
