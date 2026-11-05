export interface HeartRateStreams { time: number[]; heartrate: number[] }
export interface StravaActivitySummary {
  id: string;
  name: string;
  startTime: string;
  utcOffset: number;
  elapsedTime: number;
  averageHeartRate: number | null;
  maxHeartRate: number | null;
  hasHeartRate: boolean;
}
export interface ImportedStravaActivity extends StravaActivitySummary {
  sampleCount: number;
  importedAt: string;
}

export function activityId(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === "string" && /^[1-9]\d{0,19}$/.test(value)) return value;
  throw new Error("Identificatore attività Strava non valido.");
}

export function summarizeActivity(activity: Record<string, unknown>): StravaActivitySummary {
  const summary = {
    id: activityId(activity.id),
    name: typeof activity.name === "string" ? activity.name : "Attività Strava",
    startTime: activity.start_date as string,
    utcOffset: activity.utc_offset as number,
    elapsedTime: activity.elapsed_time as number,
  };
  const heartRate = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
  return { ...summary, averageHeartRate: heartRate(activity.average_heartrate), maxHeartRate: heartRate(activity.max_heartrate),
    hasHeartRate: activity.has_heartrate === true };
}

// Keep the original offsets, including pauses and gaps. Never manufacture samples.
export function validateHeartRateStreams(streams: HeartRateStreams, elapsedTime: number): HeartRateStreams {
  if (!Array.isArray(streams.time) || !Array.isArray(streams.heartrate) || !streams.time.length
    || streams.time.length > 86401 || streams.time.length !== streams.heartrate.length
    || streams.time.some((time, i) => !Number.isInteger(time) || time < 0 || time > elapsedTime || (i > 0 && time <= streams.time[i - 1]))
    || streams.heartrate.some((bpm) => !Number.isInteger(bpm) || bpm < 0 || bpm > 65535)) {
    throw new Error("Curva cardiaca Strava non valida. Riprova a importare l’attività.");
  }
  // Zero denotes a missing sensor reading, not a measured heartbeat.
  const valid = streams.heartrate.flatMap((bpm, i) => bpm > 0 ? [i] : []);
  return { time: valid.map((i) => streams.time[i]), heartrate: valid.map((i) => streams.heartrate[i]) };
}
