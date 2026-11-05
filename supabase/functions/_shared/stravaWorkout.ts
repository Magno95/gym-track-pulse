import { STRAVA_EXERCISES, type StravaExerciseType } from "./stravaExercises.ts";
import { validateHeartRateStreams, type HeartRateStreams } from "./stravaActivity.ts";

export const normalizeExerciseName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Export aliases only. Never write these names back to exercises or sessions.
const aliases: Array<[StravaExerciseType, ...string[]]> = [
  ["FARMERS_CARRY", "Farmer Carry", "Farmer's carry", "Farmer walk"],
  ["LATERAL_RAISE_GENERIC", "Alzate manubri", "Alzate laterali", "Lateral raise"],
  ["PEC_DECK_BUTTERFLY", "Pectoral Machine", "Pec deck"],
  ["INCLINE_DUMBBELL_BENCH_PRESS", "Panca Inclinata Manubri"],
  ["SEATED_CABLE_ROW", "Pulley", "Pulley basso"],
  ["SQUAT_GENERIC", "Squat", "Squats"],
  ["CALF_RAISE_GENERIC", "Polpacci", "Calf raise", "Polpacci Isometrics"],
  ["REAR_LEG_RAISED_LUNGE", "Affondi Bulgari con rialzo", "Affondi bulgari", "Bulgarian split squat"],
  ["LEG_RAISE_GENERIC", "Seated leg lift", "Leg raise"],
  ["WALL_BALL", "Wall ball", "Wall balls"],
  ["BODY_WEIGHT_JUMP_SQUAT", "Jump Squat", "Jump squats"],
  ["ASSAULT_BIKE", "Air bike", "Airbike"],
  ["BURPEE", "Navy Seal Burpees", "Burpees"],
  ["CURL_GENERIC", "Bicep Curl", "Biceps curl", "Curl bicipiti"],
  ["TRICEP_DIP", "Tricep Dips", "Triceps dips", "Dips"],
  ["DUMBBELL_HAMMER_CURL", "Hammer Curl", "Curl martello"],
  ["BENCH_PRESS_GENERIC", "Bench Press", "Panca", "Panca piana"],
  ["BARBELL_BENCH_PRESS", "Panca piana bilanciere"],
  ["DUMBBELL_BENCH_PRESS", "Panca piana manubri"],
  ["INCLINE_BARBELL_BENCH_PRESS", "Panca inclinata bilanciere"],
  ["BENCH_PRESS_GENERIC", "Incline Press"],
  ["PUSH_UP_GENERIC", "Push Ups", "Pushups", "Piegamenti", "Flessioni"],
  ["DEADLIFT_GENERIC", "Deadlift", "Stacco", "Stacchi da terra"],
  ["BARBELL_ROMANIAN_DEADLIFT", "Stacco rumeno", "Stacchi rumeni", "Romanian deadlift"],
  ["PULL_UP_GENERIC", "Pull Ups", "Pullups", "Trazioni", "Trazioni alla sbarra"],
  ["BENT_OVER_BARBELL_ROW", "Barbell Row", "Rematore bilanciere"],
  ["DUMBBELL_ROW", "Rematore manubrio", "Rematore manubri"],
  ["LEG_PRESS", "Leg Press", "Pressa", "Pressa gambe"],
  ["LUNGE_GENERIC", "Lunges", "Affondi"],
  ["BARBELL_BACK_SQUAT", "Back squat", "Squat bilanciere"],
  ["AIR_SQUAT", "Squat corpo libero", "Bodyweight squat"],
  ["MACHINE_LEG_EXTENSION", "Leg extension", "Leg extensions"],
  ["LEG_CURL_GENERIC", "Leg curl"],
  ["LAT_PULLDOWN", "Lat machine", "Lat pulldown"],
  ["TRICEPS_PRESSDOWN", "Push down", "Pushdown", "Triceps pushdown"],
  ["OVERHEAD_BARBELL_PRESS", "Military press", "Lento avanti bilanciere"],
  ["OVERHEAD_DUMBBELL_PRESS", "Lento avanti manubri"],
  ["SHOULDER_PRESS_GENERIC", "Shoulder press"],
  ["HIP_THRUST", "Hip thrust"],
  ["PLANK_GENERIC", "Plank"],
  ["SIDE_PLANK", "Plank laterale"],
  ["SIT_UP_GENERIC", "Sit up", "Sit ups", "Situps"],
  ["CRUNCH", "Crunch", "Crunches", "Addominali"],
  ["JUMP_ROPE", "Salto corda", "Corda"],
];

const officialNames = new Map(STRAVA_EXERCISES.map((id) => [normalizeExerciseName(id), id]));
const genericNames = new Map(STRAVA_EXERCISES.filter((id) => id.endsWith("_GENERIC"))
  .map((id) => [normalizeExerciseName(id.replace(/_GENERIC$/, "")), id]));
const officialIds = new Set<string>(STRAVA_EXERCISES);
const names = new Map(aliases.flatMap(([type, ...labels]) => labels.map((label) => [normalizeExerciseName(label), type] as const)));

export function mapStravaExercise(name: string, category = ""): { type: StravaExerciseType; fallback: boolean } {
  const normalized = normalizeExerciseName(name);
  const type = officialIds.has(name) ? name as StravaExerciseType : names.get(normalized) ?? officialNames.get(normalized) ?? genericNames.get(normalized);
  return type ? { type, fallback: false } : { type: category === "core" ? "CORE_GENERIC" : "TOTAL_BODY_GENERIC", fallback: true };
}

export interface ExportExercise {
  name: string;
  category: string;
  unit: string | null;
}
export interface ExportSession {
  id: string;
  series: number;
  reps: number;
  weight: number;
  sets: unknown;
  superset_id?: string | null;
  is_superset_secondary?: boolean | null;
  exercises: ExportExercise;
}
export interface WorkoutOptions {
  date: string;
  startTime: string;
  utcOffset: number;
  elapsedTime: number;
  name: string;
}
interface ExportSet { reps: number; weight: number; body_weight?: number; additional_weight?: number; duration_seconds?: number }
interface StravaSet { exercise_type: StravaExerciseType; repetitions?: number; weight?: number; duration?: number }

export function validateWorkoutOptions(options: WorkoutOptions) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.date) || !Number.isFinite(Date.parse(`${options.date}T00:00:00Z`))
    || new Date(`${options.date}T00:00:00Z`).toISOString().slice(0, 10) !== options.date) throw new Error("Data della sessione non valida.");
  if (!Number.isInteger(options.utcOffset) || Math.abs(options.utcOffset) > 14 * 3600) throw new Error("Fuso orario non valido.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(options.startTime)
    || !Number.isFinite(Date.parse(options.startTime))) throw new Error("Orario di inizio non valido.");
  const start = Date.parse(options.startTime);
  if (new Date(start + options.utcOffset * 1000).toISOString().slice(0, 10) !== options.date) throw new Error("L'orario deve appartenere al giorno della sessione.");
  if (!Number.isInteger(options.elapsedTime) || options.elapsedTime < 1 || options.elapsedTime > 86400) throw new Error("Inserisci una durata tra 1 secondo e 24 ore.");
  if (start > Date.now() || start + options.elapsedTime * 1000 > Date.now()) throw new Error("La sessione deve essere già terminata.");
  if (typeof options.name !== "string" || !options.name.trim() || options.name.length > 100) throw new Error("Inserisci un titolo di massimo 100 caratteri.");
}

export function buildStravaWorkout(sessions: ExportSession[], options: WorkoutOptions, heartRate?: HeartRateStreams | null) {
  validateWorkoutOptions(options);
  const streams = heartRate ? validateHeartRateStreams(heartRate, options.elapsedTime) : null;
  const sets: StravaSet[] = [];
  const description: string[] = ["GymTrack"];
  let timedSeconds = 0;
  for (const session of [...sessions].sort((a, b) => a.id.localeCompare(b.id))) {
    const exercise = session.exercises;
    const mapped = mapStravaExercise(exercise.name, exercise.category);
    const source: ExportSet[] = Array.isArray(session.sets) && session.sets.length ? session.sets
      : Number.isInteger(session.series) && session.series > 0 && session.series <= 100
        ? Array.from({ length: session.series }, () => ({ reps: session.reps, weight: Number(session.weight) })) : [];
    if (!source.length || source.length > 100) throw new Error(`Serie non valide per ${exercise.name}.`);
    const summaries: string[] = [];
    for (const set of source) {
      if (!set || !Number.isInteger(set.reps) || set.reps < 1 || set.reps > 10000 || !Number.isFinite(set.weight) || set.weight < 0) {
        throw new Error(`Dati non validi per ${exercise.name}.`);
      }
      const output: StravaSet = { exercise_type: mapped.type };
      if (set.duration_seconds !== undefined) {
        if (!Number.isInteger(set.duration_seconds) || set.duration_seconds < 1) throw new Error("Durata serie non valida.");
        output.duration = set.duration_seconds;
      } else output.repetitions = set.reps;
      if (set.body_weight !== undefined) {
        // Strava load is external resistance, not GymTrack's bodyweight scoring load.
        const additional = set.additional_weight ?? Math.max(0, set.weight - set.body_weight);
        if (!Number.isFinite(additional) || additional < 0) throw new Error("Carico aggiunto non valido.");
        if (additional > 0) output.weight = additional;
      } else if (!exercise.unit || exercise.unit === "weight") output.weight = set.weight;
      else if (exercise.unit === "time") output.duration = Math.round(set.weight);
      // Distance is never sent as kilograms. JSON sets have no distance field.
      if (output.duration !== undefined) {
        if (output.duration < 1) throw new Error(`Durata non valida per ${exercise.name}.`);
        timedSeconds += output.duration;
      }
      sets.push(output);
      summaries.push(`${output.repetitions ? `${output.repetitions} rep` : ""}${output.duration ? ` ${output.duration}s` : ""}${output.weight !== undefined ? ` @ ${output.weight}kg` : ""}${exercise.unit === "distance" && set.body_weight === undefined ? ` @ ${set.weight}m` : ""}`.trim());
    }
    description.push(`${exercise.name}${session.superset_id ? " [superset]" : ""}: ${summaries.join("; ")}${mapped.fallback ? " (esercizio generico su Strava)" : ""}`);
  }
  if (!sets.length || sets.length > 10000) throw new Error("La sessione deve contenere da 1 a 10000 serie.");
  if (timedSeconds > options.elapsedTime) throw new Error("La durata totale non può essere inferiore alla somma delle serie a tempo.");
  const fullDescription = description.join("\n");
  if (fullDescription.length > 10000) throw new Error("Il riepilogo supera il limite di 10000 caratteri: riduci la sessione prima di pubblicarla.");
  return {
    file: { version: "1.0", start_time: options.startTime, utc_offset: options.utcOffset,
      elapsed_time: options.elapsedTime, creator: { name: "GymTrack" }, sets,
      ...(streams?.time.length ? { streams } : {}) },
    description: fullDescription,
  };
}
