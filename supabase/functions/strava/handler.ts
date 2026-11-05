import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { buildStravaWorkout, validateWorkoutOptions, type ExportSession, type WorkoutOptions } from "../_shared/stravaWorkout.ts";
import { activityId as parseActivityId, summarizeActivity, validateHeartRateStreams,
  type HeartRateStreams, type ImportedStravaActivity, type StravaActivitySummary } from "../_shared/stravaActivity.ts";

interface Config { supabaseUrl: string; anonKey: string; appUrl: string; clientId: string; clientSecret: string; callbackUrl: string }
interface Connection { athlete_id: number; access_token: string; refresh_token: string; expires_at: number; scope: string }
interface Publication { athlete_id: number; upload_id: string | null; activity_id: string | null; status: string; error: string | null; updated_at: string }
interface Upload { id?: number; id_str?: string; activity_id?: number | null; error?: string | null }
interface ImportedActivity { athlete_id: number; activity: ImportedStravaActivity; streams: HeartRateStreams | null }
class HttpError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const canRead = (scope: string) => scope.split(/[,\s]+/).some((value) => value === "activity:read" || value === "activity:read_all");
const duplicateMessage = "Strava ha riconosciuto un duplicato. I dati importati sono salvati: puoi eliminare manualmente l’attività originale su Strava e riprovare.";

// Injectable boundaries let tests exercise real routing, auth and upload behavior.
export function createStravaHandler(config: Config, admin: SupabaseClient, http: typeof fetch = fetch) {
  const appOrigin = new URL(config.appUrl).origin;
  const cors = { "Access-Control-Allow-Origin": appOrigin, "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Vary": "Origin", "Cache-Control": "no-store" };
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });
  const check = <T,>(result: { data: T; error: unknown }): T => {
    if (result.error) throw new HttpError("Errore di salvataggio Strava. Riprova tra poco.", 503);
    return result.data;
  };
  const configured = () => {
    if (!config.clientId || !config.clientSecret) throw new HttpError("Strava non è ancora configurato sul server.", 503);
  };
  async function locked<T>(userId: string, action: () => Promise<T>): Promise<T> {
    const token = crypto.randomUUID();
    if (!check(await admin.rpc("claim_strava_lock", { p_user_id: userId, p_token: token }))) {
      throw new HttpError("Un'operazione Strava è già in corso. Riprova tra qualche secondo.", 409);
    }
    try { return await action(); }
    finally { await admin.from("strava_locks").delete().eq("user_id", userId).eq("token", token); }
  }
  async function connection(userId: string): Promise<Connection> {
    const row = check(await admin.from("strava_connections").select("athlete_id,access_token,refresh_token,expires_at,scope").eq("user_id", userId).maybeSingle());
    if (!row) throw new HttpError("Collega il tuo account Strava.", 401);
    return row;
  }
  async function tokenRequest(parameters: Record<string, string>) {
    const response = await http("https://www.strava.com/oauth/token", { method: "POST", signal: AbortSignal.timeout(12000),
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, ...parameters }) });
    if (!response.ok) throw new HttpError(response.status === 429 ? "Strava ha raggiunto il limite di richieste. Riprova più tardi." : "Ricollega Strava per rinnovare l'autorizzazione.", response.status === 429 ? 429 : 401);
    const body = await response.json();
    if (!body.access_token || !body.refresh_token || !Number.isInteger(body.expires_at)) throw new HttpError("Risposta Strava non valida.", 502);
    return body;
  }
  async function accessToken(userId: string, row: Connection) {
    if (row.expires_at > Date.now() / 1000 + 300) return row.access_token;
    const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: row.refresh_token });
    check(await admin.from("strava_connections").update({ access_token: tokens.access_token, refresh_token: tokens.refresh_token,
      expires_at: tokens.expires_at, updated_at: new Date().toISOString() }).eq("user_id", userId));
    return tokens.access_token as string;
  }
  async function publication(userId: string, date: string): Promise<Publication | null> {
    return check(await admin.from("strava_publications").select("athlete_id,upload_id,activity_id,status,error,updated_at")
      .eq("user_id", userId).eq("session_date", date).maybeSingle());
  }
  async function importedActivity(userId: string, date: string, includeStreams = false): Promise<ImportedActivity | null> {
    return check(await admin.from("strava_imports").select(includeStreams ? "athlete_id,activity,streams" : "athlete_id,activity")
      .eq("user_id", userId).eq("session_date", date).maybeSingle());
  }
  async function getStrava(path: string, access: string, allowMissing = false) {
    const response = await http(`https://www.strava.com/api/v3${path}`, {
      headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(12000) });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) {
      if (response.status === 429) throw new HttpError("Limite Strava raggiunto. Riprova più tardi.", 429);
      if (response.status === 401) throw new HttpError("Ricollega Strava per rinnovare l’autorizzazione.", 401);
      if (response.status === 403) throw new HttpError("Strava non consente la lettura dei dati. Verifica i permessi delle attività e dei dati cardiaci.", 403);
      if (response.status === 404) throw new HttpError("Attività non disponibile. Aggiorna l’elenco e riprova.", 404);
      throw new HttpError("Impossibile leggere l’attività Strava. Riprova più tardi.", 502);
    }
    return response.json();
  }
  function activitySummary(activity: Record<string, unknown>, date: string): StravaActivitySummary {
    try {
      const summary = summarizeActivity(activity);
      validateWorkoutOptions({ ...summary, date, name: "Importazione Strava" });
      if (typeof activity.external_id === "string" && activity.external_id.startsWith("gymtrack-")) {
        throw new Error("Scegli l’attività originale del Garmin, non una pubblicazione GymTrack.");
      }
      return summary;
    } catch (error) { throw new HttpError(error instanceof Error ? error.message : "Attività Strava non valida."); }
  }
  function publicPublication(row: Publication | null) {
    if (!row) return null;
    // If a function died during an HTTP request, do not silently allow a second upload.
    return { status: row.status === "uploading" && Date.now() - Date.parse(row.updated_at) > 90000 ? "uncertain" : row.status,
      activityId: row.activity_id, canCheck: !!row.upload_id, error: row.error };
  }
  async function saveUpload(userId: string, date: string, upload: Upload) {
    const activityId = upload.activity_id ? String(upload.activity_id) : null;
    const status = activityId ? "published" : upload.error ? "failed" : "processing";
    const uploadId = upload.id_str ?? (upload.id ? String(upload.id) : null);
    if (!uploadId) throw new HttpError("Identificatore upload Strava mancante.", 502);
    check(await admin.from("strava_publications").update({ upload_id: uploadId, activity_id: activityId, status,
      error: upload.error ? /duplicat/i.test(upload.error) ? duplicateMessage : "Strava non ha elaborato la sessione. Verifica che non sia già presente prima di riprovare." : null,
      updated_at: new Date().toISOString() }).eq("user_id", userId).eq("session_date", date));
    return publicPublication(await publication(userId, date));
  }
  async function hash(value: string) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  async function callback(userId: string, input: Record<string, unknown>) {
    const state = input.state;
    const result = (date: string | null, notice: string) => json({ date, result: notice });
    if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) return result(null, "invalid_state");
    const stateHash = await hash(state);
    // Delete + RETURNING consumes state exactly once, including denial/error callbacks.
    const saved = check(await admin.from("strava_oauth_states").delete().eq("state_hash", stateHash).eq("user_id", userId)
      .gt("expires_at", new Date().toISOString()).select("user_id,session_date").maybeSingle());
    if (!saved) return result(null, "invalid_state");
    if (input.error) return result(saved.session_date, "denied");
    const code = input.code;
    const scope = typeof input.scope === "string" ? input.scope : "";
    if (typeof code !== "string" || !code || !scope.split(/[,\s]+/).includes("activity:write")) return result(saved.session_date, "missing_scope");
    try {
      configured();
      await locked(saved.user_id, async () => {
        const tokens = await tokenRequest({ grant_type: "authorization_code", code });
        if (!Number.isSafeInteger(tokens.athlete?.id)) throw new HttpError("Account Strava non valido.");
        check(await admin.from("strava_connections").upsert({ user_id: saved.user_id, athlete_id: tokens.athlete.id,
          access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_at: tokens.expires_at, scope,
          updated_at: new Date().toISOString() }));
      });
      return result(saved.session_date, "connected");
    } catch { return result(saved.session_date, "connection_failed"); }
  }
  async function readSessions(userId: string, date: string, jwt: string): Promise<ExportSession[]> {
    const client = createClient(config.supabaseUrl, config.anonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const rows: ExportSession[] = [];
    for (let from = 0; from < 5000; from += 500) {
      const page = check(await client.from("sessions").select("id,series,reps,weight,sets,superset_id,is_superset_secondary,exercises!inner(name,category,unit,user_id)")
        .eq("date", date).eq("exercises.user_id", userId).order("id").range(from, from + 499).abortSignal(AbortSignal.timeout(12000))) ?? [];
      rows.push(...page as unknown as ExportSession[]);
      if (page.length < 500) return rows;
    }
    throw new HttpError("La sessione contiene troppi esercizi da esportare.");
  }
  return async (request: Request): Promise<Response> => {
    try {
      const origin = request.headers.get("Origin");
      if (origin && origin !== appOrigin) return json({ error: "Origine non consentita." }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (request.method !== "POST") return json({ error: "Metodo non consentito." }, 405);
      const jwt = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
      if (!jwt) return json({ error: "Accedi per utilizzare Strava." }, 401);
      const auth = await admin.auth.getUser(jwt);
      if (auth.error || !auth.data.user) return json({ error: "Sessione scaduta. Accedi nuovamente." }, 401);
      const userId = auth.data.user.id;
      const input = await request.json();
      if (input?.action === "callback") return await callback(userId, input);
      const date = input?.date;
      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
        || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new HttpError("Data non valida.");
      if (input.action === "status") {
        const connected = check(await admin.from("strava_connections").select("athlete_id,scope").eq("user_id", userId).maybeSingle());
        const imported = await importedActivity(userId, date);
        return json({ configured: !!config.clientId && !!config.clientSecret, connected: !!connected,
          canReadActivities: !!connected && canRead(connected.scope),
          importedActivity: imported && connected?.athlete_id === imported.athlete_id ? imported.activity : null,
          publication: publicPublication(await publication(userId, date)) });
      }
      configured();
      if (input.action === "connect") {
        check(await admin.from("strava_oauth_states").delete().lt("expires_at", new Date().toISOString()));
        const state = [...crypto.getRandomValues(new Uint8Array(32))].map((v) => v.toString(16).padStart(2, "0")).join("");
        check(await admin.from("strava_oauth_states").insert({ state_hash: await hash(state), user_id: userId, session_date: date }));
        const authorize = new URL("https://www.strava.com/oauth/authorize");
        authorize.search = new URLSearchParams({ client_id: config.clientId, response_type: "code", redirect_uri: config.callbackUrl,
          approval_prompt: "force", scope: "activity:read_all,activity:write", state }).toString();
        return json({ url: authorize.href });
      }
      if (!["publish", "upload-status", "disconnect", "activities", "import-activity"].includes(input.action)) throw new HttpError("Azione non valida.");
      return await locked(userId, async () => {
        const row = await connection(userId);
        if (input.action === "disconnect") {
          try {
            const access = await accessToken(userId, row);
            const response = await http("https://www.strava.com/oauth/deauthorize", { method: "POST", headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(12000) });
            if (!response.ok && response.status !== 401) throw new HttpError("Impossibile scollegare Strava. Riprova.", 502);
          } catch (error) {
            // A revoked grant no longer needs remote deauthorization.
            if (!(error instanceof HttpError) || error.status !== 401) throw error;
          }
          check(await admin.from("strava_connections").delete().eq("user_id", userId));
          check(await admin.from("strava_oauth_states").delete().eq("user_id", userId));
          check(await admin.from("strava_imports").delete().eq("user_id", userId));
          return json({ disconnected: true });
        }
        if ((input.action === "activities" || input.action === "import-activity") && !canRead(row.scope)) {
          throw new HttpError("Ricollega Strava e autorizza la lettura delle attività per importare durata e battito.", 403);
        }
        const access = await accessToken(userId, row);
        const previous = await publication(userId, date);
        if (input.action === "activities") {
          // Cover every UTC offset, then match the activity's local day. This also
          // works around DST changes and when the browser is in a different zone.
          const midnight = Date.parse(`${date}T00:00:00Z`) / 1000;
          const activities: StravaActivitySummary[] = [];
          for (let page = 1; page <= 10; page++) {
            const batch = await getStrava(`/athlete/activities?after=${midnight - 14 * 3600 - 1}&before=${midnight + 38 * 3600}&per_page=100&page=${page}`, access);
            if (!Array.isArray(batch)) throw new HttpError("Elenco attività Strava non valido.", 502);
            for (const candidate of batch) {
              try {
                const summary = activitySummary(candidate, date);
                if (summary.id !== previous?.activity_id) activities.push(summary);
              } catch { /* Other local days and unsupported activity durations are not candidates. */ }
            }
            if (batch.length < 100) return json({ activities });
          }
          throw new HttpError("Troppe attività Strava per questa giornata. Riprova più tardi.");
        }
        if (input.action === "import-activity") {
          if (previous && previous.status !== "failed") throw new HttpError("La sessione è già pubblicata o ha un invio in corso. Non puoi cambiare l’importazione.", 409);
          let id;
          try { id = parseActivityId(input.activityId); } catch { throw new HttpError("Scegli un’attività Strava valida."); }
          const detail = await getStrava(`/activities/${id}`, access);
          if (detail.athlete?.id !== row.athlete_id) throw new HttpError("L’attività non appartiene all’account Strava collegato.", 403);
          const summary = activitySummary(detail, date);
          if (summary.id !== id) throw new HttpError("Strava ha restituito un’attività diversa da quella selezionata.", 502);
          let streams: HeartRateStreams | null = null;
          if (summary.hasHeartRate) {
            const data = await getStrava(`/activities/${id}/streams?keys=time,heartrate&key_by_type=true`, access, true);
            if (data?.heartrate) {
              try { streams = validateHeartRateStreams({ time: data.time?.data, heartrate: data.heartrate.data }, summary.elapsedTime); }
              catch (error) { throw new HttpError(error instanceof Error ? error.message : "Curva cardiaca non valida.", 502); }
              if (!streams.time.length) streams = null;
            }
          }
          const activity: ImportedStravaActivity = { ...summary, sampleCount: streams?.time.length ?? 0, importedAt: new Date().toISOString() };
          check(await admin.from("strava_imports").upsert({ user_id: userId, session_date: date, athlete_id: row.athlete_id, activity, streams }));
          return json({ importedActivity: activity });
        }
        if (input.action === "upload-status") {
          if (!previous?.upload_id || previous.status === "published" || previous.status === "failed") return json({ publication: publicPublication(previous) });
          if (previous.athlete_id !== row.athlete_id) throw new HttpError("Ricollega l'account Strava usato per questa pubblicazione.", 409);
          const response = await http(`https://www.strava.com/api/v3/uploads/${encodeURIComponent(previous.upload_id)}`, {
            headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(12000) });
          if (!response.ok) throw new HttpError("Impossibile verificare l'upload Strava. Riprova più tardi.", response.status === 429 ? 429 : 502);
          return json({ publication: await saveUpload(userId, date, await response.json()) });
        }
        if (previous && previous.status !== "failed") return json({ publication: publicPublication(previous) });
        const imported = input.useImportedActivity === true ? await importedActivity(userId, date, true) : null;
        if (input.useImportedActivity === true && (!imported || imported.athlete_id !== row.athlete_id)) {
          throw new HttpError("Importa prima un’attività dall’account Strava collegato.");
        }
        const options = { date, startTime: imported?.activity.startTime ?? input.startTime,
          utcOffset: imported?.activity.utcOffset ?? input.utcOffset, elapsedTime: imported?.activity.elapsedTime ?? input.elapsedTime, name: input.name } as WorkoutOptions;
        let workout;
        try { workout = buildStravaWorkout(await readSessions(userId, date, jwt), options, imported?.streams); }
        catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(error instanceof Error ? error.message : "Sessione non valida."); }
        check(await admin.from("strava_publications").upsert({ user_id: userId, session_date: date, athlete_id: row.athlete_id,
          status: "uploading", upload_id: null, activity_id: null, error: null, updated_at: new Date().toISOString() }));
        const form = new FormData();
        form.set("file", new Blob([JSON.stringify(workout.file)], { type: "application/json" }), `gymtrack-${userId}-${date}.json`);
        form.set("data_type", "json"); form.set("sport_type", "WeightTraining");
        form.set("external_id", `gymtrack-${userId}-${date}.json`);
        form.set("name", options.name.trim()); form.set("description", workout.description);
        try {
          const response = await http("https://www.strava.com/api/v3/uploads", { method: "POST", body: form,
            headers: { Authorization: `Bearer ${access}` }, signal: AbortSignal.timeout(12000) });
          if (!response.ok) {
            const definite = response.status >= 400 && response.status < 500;
            const detail = await response.text();
            check(await admin.from("strava_publications").update({ status: definite ? "failed" : "uncertain",
              error: response.status === 429 ? "Limite Strava raggiunto. Riprova più tardi." : definite && /duplicat/i.test(detail) ? duplicateMessage : "Strava non ha accettato l'upload. Verifica l'attività su Strava prima di riprovare.",
              updated_at: new Date().toISOString() }).eq("user_id", userId).eq("session_date", date));
            return json({ publication: publicPublication(await publication(userId, date)) });
          }
          return json({ publication: await saveUpload(userId, date, await response.json()) });
        } catch {
          // A timeout may happen AFTER Strava accepted the file: never blindly retry.
          check(await admin.from("strava_publications").update({ status: "uncertain", error: "Esito incerto: controlla il tuo profilo Strava prima di un nuovo invio.",
            updated_at: new Date().toISOString() }).eq("user_id", userId).eq("session_date", date));
          return json({ publication: publicPublication(await publication(userId, date)) });
        }
      });
    } catch (error) {
      return json({ error: error instanceof HttpError ? error.message : "Servizio Strava non disponibile. Riprova tra poco." }, error instanceof HttpError ? error.status : 503);
    }
  };
}
