export type SessionSet = {
  reps: number;
  /** Effective load, including body weight when applicable. */
  weight: number;
  body_weight?: number;
  additional_weight?: number;
  /** Timed bodyweight sets store seconds in reps and load in kilograms. */
  duration_seconds?: number;
};

export type BodyWeightMeasurement = {
  effective_date: string;
  weight_kg: number;
};

export function todayLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function findBodyWeight(history: BodyWeightMeasurement[], date: string): number | null {
  const measurement = history
    .filter((entry) => entry.effective_date <= date)
    .reduce<BodyWeightMeasurement | null>((latest, entry) =>
      !latest || entry.effective_date > latest.effective_date ? entry : latest, null);
  return measurement ? Number(measurement.weight_kg) : null;
}

/** Form weights represent added load for bodyweight exercises. */
export function materializeSets(
  sets: Array<{ reps: number; weight: number }>,
  isBodyweight: boolean,
  bodyWeight: number | null,
  unit: string | null = "weight",
): SessionSet[] {
  if (isBodyweight && (!bodyWeight || !Number.isFinite(bodyWeight) || bodyWeight <= 0)) {
    throw new Error("Add a profile weight valid on the session date before saving.");
  }
  return sets.map((set) => {
    if (!Number.isInteger(set.reps) || set.reps < 1 || !Number.isFinite(set.weight) || set.weight < 0) {
      throw new Error("Enter valid repetitions and a non-negative load.");
    }
    return isBodyweight ? {
      reps: set.reps,
      weight: Math.round((bodyWeight! + set.weight) * 100) / 100,
      body_weight: bodyWeight!,
      additional_weight: set.weight,
      ...(unit === "time" ? { duration_seconds: set.reps } : {}),
    } : { reps: set.reps, weight: set.weight };
  });
}

export function getSessionSets(session: { sets: unknown; series: number; reps: number; weight: number }): SessionSet[] {
  if (Array.isArray(session.sets) && session.sets.length > 0) {
    return session.sets as SessionSet[];
  }
  return Array.from({ length: session.series }, () => ({ reps: session.reps, weight: Number(session.weight) }));
}

export function isBodyweightSession(session: { sets: unknown }): boolean {
  return Array.isArray(session.sets) && typeof session.sets[0]?.body_weight === "number";
}

export function isTimedBodyweightSession(session: { sets: unknown }): boolean {
  return isBodyweightSession(session) && Array.isArray(session.sets) && typeof session.sets[0]?.duration_seconds === "number";
}

export function getEditableSets(session: Parameters<typeof getSessionSets>[0]): Array<{ reps: number; weight: number }> {
  return getSessionSets(session).map((set) => ({
    reps: set.reps,
    weight: set.body_weight !== undefined
      ? (set.additional_weight ?? Math.max(0, set.weight - set.body_weight))
      : set.weight,
  }));
}

/** Keep the original snapshot unless the workout date itself changes. */
export function bodyWeightForEdit(
  session: Parameters<typeof getSessionSets>[0] & { date: string },
  date: string,
  history: BodyWeightMeasurement[],
): number | null {
  if (!isBodyweightSession(session)) return null;
  return date === session.date ? getSessionSets(session)[0].body_weight! : findBodyWeight(history, date);
}
