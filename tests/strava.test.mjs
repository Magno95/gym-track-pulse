import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { dirname, resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";

const root = resolve(import.meta.dirname, "..");
function loader(boundaries = {}) {
  const modules = new Map();
  function load(file) {
    file = resolve(root, file);
    if (modules.has(file)) return modules.get(file);
    const exports = {}; modules.set(file, exports);
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require: (name) => name.startsWith("npm:") ? boundaries : load(resolve(dirname(file), name)),
      crypto: webcrypto, fetch, Request, Response, URL, URLSearchParams, FormData, Blob, AbortSignal, TextEncoder, Date, console });
    return exports;
  }
  return load;
}
const workout = loader()("supabase/functions/_shared/stravaWorkout.ts");
const plain = (value) => JSON.parse(JSON.stringify(value));
const options = { date: "2026-10-03", startTime: "2026-10-03T16:00:00Z", utcOffset: 7200, elapsedTime: 3600, name: "Palestra" };
const session = (name, sets, unit = "weight", extra = {}) => ({ id: name, series: sets?.length ?? 2, reps: 8, weight: 40,
  sets, exercises: { name, category: "legs", unit }, ...extra });

test("maps all bundled and sample exercise names and official identifiers without modifying names", () => {
  const images = readFileSync(resolve(root, "src/lib/generatedExerciseImages.ts"), "utf8");
  const sample = readFileSync(resolve(root, "src/data/mockData.ts"), "utf8");
  const names = [...images.matchAll(/\["([^"]+)", "/g), ...sample.matchAll(/name: "([^"]+)"/g)].map((match) => match[1]);
  for (const name of names) assert.equal(workout.mapStravaExercise(name).fallback, false, name);
  assert.equal(workout.mapStravaExercise("  Pànca   INCLINATA Manubri ").type, "INCLINE_DUMBBELL_BENCH_PRESS");
  assert.equal(workout.mapStravaExercise("Navy Seal Burpees").type, "BURPEE");
  assert.equal(workout.mapStravaExercise("Air bike").type, "ASSAULT_BIKE");
  assert.equal(workout.mapStravaExercise("Pull up").type, "PULL_UP_GENERIC");
  const { STRAVA_EXERCISES } = loader()("supabase/functions/_shared/stravaExercises.ts");
  assert.equal(STRAVA_EXERCISES.length, 656);
  assert.equal(new Set(STRAVA_EXERCISES).size, 656);
  for (const id of STRAVA_EXERCISES) assert.equal(workout.mapStravaExercise(id).type, id);
  const input = [session("Panca Inclinata Manubri", [{ reps: 10, weight: 20 }, { reps: 8, weight: 22 }])];
  const before = JSON.stringify(input);
  const output = workout.buildStravaWorkout(input, options);
  assert.equal(JSON.stringify(input), before);
  assert.equal(output.file.sets[1].weight, 22);
  assert.match(output.description, /Panca Inclinata Manubri/);
});

test("exports real sets, timed bodyweight and added load; never exports metres or seconds as kilograms", () => {
  const rows = [
    session("Plank", [{ reps: 60, weight: 85, body_weight: 80, additional_weight: 5, duration_seconds: 60 }], "time"),
    session("Pull Ups", [{ reps: 8, weight: 80, body_weight: 80, additional_weight: 0 }]),
    session("Farmer Carry", [{ reps: 2, weight: 30 }], "distance"),
    session("Air bike", [{ reps: 1, weight: 120 }], "time"),
    session("Squat", null),
    session("Esercizio personale", [{ reps: 10, weight: 12 }], "weight", { superset_id: "pair" }),
  ];
  const output = plain(workout.buildStravaWorkout(rows, options));
  const plank = output.file.sets.find((set) => set.exercise_type === "PLANK_GENERIC");
  assert.deepEqual(plank, { exercise_type: "PLANK_GENERIC", duration: 60, weight: 5 });
  assert.deepEqual(output.file.sets.find((set) => set.exercise_type === "PULL_UP_GENERIC"), { exercise_type: "PULL_UP_GENERIC", repetitions: 8 });
  assert.equal(output.file.sets.find((set) => set.exercise_type === "ASSAULT_BIKE").weight, undefined);
  assert.equal(output.file.sets.find((set) => set.exercise_type === "ASSAULT_BIKE").duration, 120);
  assert.equal(output.file.sets.find((set) => set.exercise_type === "FARMERS_CARRY").weight, undefined);
  assert.equal(output.file.sets.filter((set) => set.exercise_type === "SQUAT_GENERIC").length, 2);
  assert.match(output.description, /30m/);
  assert.match(output.description, /Esercizio personale \[superset\]/);
  assert.equal(output.file.utc_offset, 7200);
  assert.throws(() => workout.buildStravaWorkout(rows, { ...options, elapsedTime: 60 }), /somma delle serie/);
  assert.throws(() => workout.buildStravaWorkout([], options), /contenere/);
  assert.throws(() => workout.buildStravaWorkout(rows, { ...options, date: "2026-02-30" }), /Data/);
  assert.throws(() => workout.buildStravaWorkout(rows, { ...options, utcOffset: -43200, startTime: "2026-10-03T01:00:00Z" }), /giorno/);
  assert.throws(() => workout.buildStravaWorkout(rows, { ...options, elapsedTime: 0 }), /durata/);
  assert.throws(() => workout.buildStravaWorkout([session("Squat", [null])], options), /Dati/);
});

// In-memory HTTP/database boundary, while routing and state transitions are the actual handler.
function backend() {
  const tables = { strava_connections: [], strava_publications: [], strava_oauth_states: [], strava_imports: [], sessions: [session("Squat", [{ reps: 8, weight: 40 }])] };
  const calls = []; const locks = new Set(); let user = "alice";
  function query(table) {
    let action = "read", payload, single = false; const filters = [];
    const q = {
      select: () => q, order: () => q, range: () => q, abortSignal: () => q,
      eq: (key, value) => { filters.push((row) => row[key] === value); return q; },
      lt: (key, value) => { filters.push((row) => row[key] < value); return q; },
      gt: (key, value) => { filters.push((row) => row[key] > value); return q; },
      maybeSingle: () => { single = true; return q; },
      insert: (value) => { action = "insert"; payload = value; return q; },
      upsert: (value) => { action = "upsert"; payload = value; return q; },
      update: (value) => { action = "update"; payload = value; return q; },
      delete: () => { action = "delete"; return q; },
      then: (resolve) => {
        if (table === "strava_locks") { locks.delete(user); return Promise.resolve({ data: null, error: null }).then(resolve); }
        const rows = tables[table];
        const matches = rows.filter((row) => filters.every((filter) => filter(row)));
        if (action === "delete") tables[table] = rows.filter((row) => !matches.includes(row));
        if (action === "insert") rows.push({ ...payload, expires_at: new Date(Date.now() + 600000).toISOString() });
        if (action === "update") matches.forEach((row) => Object.assign(row, payload));
        if (action === "upsert") {
          const existing = rows.find((row) => row.user_id === payload.user_id && (!payload.session_date || row.session_date === payload.session_date));
          if (existing) Object.assign(existing, payload); else rows.push({ ...payload });
        }
        return Promise.resolve({ data: single ? matches[0] ?? null : matches, error: null }).then(resolve);
      },
    };
    return q;
  }
  const admin = { from: query, auth: { getUser: async (jwt) => jwt === "valid" ? { data: { user: { id: user } }, error: null } : { data: { user: null }, error: "bad jwt" } },
    rpc: async (_name, args) => { const acquired = !locks.has(args.p_user_id); if (acquired) locks.add(args.p_user_id); return { data: acquired, error: null }; } };
  let upstream = async () => Response.json({ id: 123, id_str: "123", activity_id: null, error: null }, { status: 201 });
  const load = loader({ createClient: () => ({ from: (table) => {
    if (table === "sessions") {
      const q = query(table); q.eq = () => q; return q;
    }
    return query(table);
  } }) });
  const handler = load("supabase/functions/strava/handler.ts").createStravaHandler({ appUrl: "https://gym.example", supabaseUrl: "https://db.example", anonKey: "anon",
    clientId: "123", clientSecret: "secret", callbackUrl: "https://gym.example/strava/callback" }, admin,
    async (url, init) => { calls.push({ url, ...init }); return upstream(url, init); });
  const send = async (body, jwt = "valid", origin = "https://gym.example") => {
    const response = await handler(new Request("https://db.example/functions/v1/strava", { method: "POST", headers: { Authorization: `Bearer ${jwt}`, Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ date: options.date, ...body }) }));
    return { status: response.status, body: await response.json() };
  };
  const connect = (scope = "activity:write") => tables.strava_connections.push({ user_id: "alice", athlete_id: 7, access_token: "access", refresh_token: "refresh", expires_at: 9999999999, scope });
  return { tables, calls, locks, handler, send, connect, setUser: (value) => { user = value; }, upstream: (fn) => { upstream = fn; } };
}

test("server requires a verified user, rejects foreign origins and never returns credentials", async () => {
  const b = backend(); b.connect();
  assert.equal((await b.send({ action: "publish" }, "forged")).status, 401);
  assert.equal((await b.send({ action: "status" }, "valid", "https://evil.example")).status, 403);
  const status = await b.send({ action: "status" });
  assert.equal(status.body.connected, true);
  assert.equal(JSON.stringify(status).includes("refresh"), false);
  b.setUser("bob");
  assert.equal((await b.send({ action: "status" })).body.connected, false);
  assert.equal((await b.send({ action: "publish", ...options })).status, 401);
  assert.equal(b.calls.length, 0);
});

test("OAuth state is hashed, expires, belongs to the signed-in user and is consumed once", async () => {
  const b = backend();
  const authorize = new URL((await b.send({ action: "connect" })).body.url);
  const state = authorize.searchParams.get("state");
  assert.equal(authorize.searchParams.get("scope"), "activity:read_all,activity:write");
  assert.notEqual(b.tables.strava_oauth_states[0].state_hash, state);
  b.setUser("bob");
  assert.equal((await b.send({ action: "callback", state, code: "code", scope: "activity:write" })).body.result, "invalid_state");
  assert.equal(b.tables.strava_oauth_states.length, 1);
  b.setUser("alice");
  b.upstream(async () => Response.json({ athlete: { id: 7 }, access_token: "new-access", refresh_token: "new-refresh", expires_at: 9999999999 }));
  assert.equal((await b.send({ action: "callback", state, code: "code", scope: "activity:write" })).body.result, "connected");
  assert.equal(b.tables.strava_connections[0].refresh_token, "new-refresh");
  assert.equal((await b.send({ action: "callback", state, code: "code", scope: "activity:write" })).body.result, "invalid_state");
  const state2 = new URL((await b.send({ action: "connect" })).body.url).searchParams.get("state");
  assert.equal((await b.send({ action: "callback", state: state2, code: "code", scope: "read" })).body.result, "missing_scope");
  const state3 = new URL((await b.send({ action: "connect" })).body.url).searchParams.get("state");
  b.tables.strava_oauth_states[0].expires_at = "2000-01-01T00:00:00Z";
  assert.equal((await b.send({ action: "callback", state: state3, code: "code", scope: "activity:write" })).body.result, "invalid_state");
});

test("uploads official JSON, resumes processing and blocks duplicate publishing", async () => {
  const b = backend(); b.connect();
  assert.equal((await b.send({ action: "publish", ...options })).body.publication.status, "processing");
  const form = b.calls[0].body;
  assert.equal(form.get("sport_type"), "WeightTraining");
  assert.equal(form.get("data_type"), "json");
  assert.equal(form.get("external_id"), `gymtrack-alice-${options.date}.json`);
  assert.deepEqual(JSON.parse(await form.get("file").text()).sets, [{ exercise_type: "SQUAT_GENERIC", repetitions: 8, weight: 40 }]);
  await b.send({ action: "publish", ...options });
  assert.equal(b.calls.length, 1);
  b.upstream(async () => Response.json({ id_str: "123", activity_id: 456, error: null }));
  assert.equal((await b.send({ action: "upload-status" })).body.publication.activityId, "456");
  assert.equal((await b.send({ action: "publish", ...options })).body.publication.status, "published");
  assert.equal(b.calls.length, 2);
});

test("refreshes and persists both tokens before upload, and serializes concurrent requests", async () => {
  const b = backend(); b.connect(); b.tables.strava_connections[0].expires_at = 0;
  b.upstream(async (url, init) => {
    if (url.endsWith("/oauth/token")) return Response.json({ access_token: "rotated", refresh_token: "rotated-refresh", expires_at: 9999999999 });
    assert.equal(init.headers.Authorization, "Bearer rotated");
    return Response.json({ id_str: "123", activity_id: 456 });
  });
  const replies = await Promise.all([b.send({ action: "publish", ...options }), b.send({ action: "publish", ...options })]);
  assert.deepEqual(replies.map((reply) => reply.status).sort(), [200, 409]);
  assert.equal(b.tables.strava_connections[0].refresh_token, "rotated-refresh");
  assert.equal(b.calls.filter((call) => call.url.endsWith("/uploads")).length, 1);
});

test("ambiguous upload failures cannot trigger a second upload, including after a remount", async () => {
  const b = backend(); b.connect();
  b.upstream(async () => { throw new Error("connection reset after request accepted"); });
  assert.equal((await b.send({ action: "publish", ...options })).body.publication.status, "uncertain");
  assert.equal((await b.send({ action: "status" })).body.publication.status, "uncertain");
  assert.equal((await b.send({ action: "publish", ...options })).body.publication.status, "uncertain");
  assert.equal(b.calls.length, 1);
  b.tables.strava_publications[0].status = "uploading";
  b.tables.strava_publications[0].updated_at = "2000-01-01T00:00:00Z";
  assert.equal((await b.send({ action: "status" })).body.publication.status, "uncertain");
});

test("upstream validation and rate limits remain retryable, while disconnect removes revoked credentials", async () => {
  const b = backend(); b.connect();
  b.upstream(async () => Response.json({ message: "rate limit" }, { status: 429 }));
  const limited = await b.send({ action: "publish", ...options });
  assert.equal(limited.body.publication.status, "failed");
  assert.match(limited.body.publication.error, /Limite/);
  b.upstream(async () => Response.json({ id_str: "123", activity_id: 456 }));
  assert.equal((await b.send({ action: "publish", ...options })).body.publication.status, "published");
  b.tables.strava_connections[0].expires_at = 0;
  b.upstream(async () => Response.json({ message: "revoked" }, { status: 401 }));
  assert.equal((await b.send({ action: "disconnect" })).body.disconnected, true);
  assert.equal(b.tables.strava_connections.length, 0);
  assert.equal(b.tables.strava_publications.length, 1);
});

test("Strava tables and lock RPC are inaccessible to browser roles; service lease is atomic", async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);");
    await db.exec(readFileSync(resolve(root, "supabase/migrations/20261105000000_strava.sql"), "utf8"));
    await db.exec(readFileSync(resolve(root, "supabase/migrations/20261105001000_strava_imports.sql"), "utf8"));
    const user = webcrypto.randomUUID(), first = webcrypto.randomUUID(), second = webcrypto.randomUUID();
    await db.query("INSERT INTO auth.users VALUES ($1)", [user]);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`SET ROLE ${role}`);
      for (const table of ["strava_connections", "strava_oauth_states", "strava_publications", "strava_locks", "strava_imports"]) {
        await assert.rejects(db.query(`SELECT * FROM public.${table}`), /permission denied/);
        await assert.rejects(db.query(`DELETE FROM public.${table}`), /permission denied/);
      }
      await assert.rejects(db.query("SELECT public.claim_strava_lock($1,$2)", [user, first]), /permission denied/);
      await db.exec("RESET ROLE");
    }
    await db.exec("SET ROLE service_role");
    assert.equal((await db.query("SELECT public.claim_strava_lock($1,$2) AS ok", [user, first])).rows[0].ok, true);
    assert.equal((await db.query("SELECT public.claim_strava_lock($1,$2) AS ok", [user, second])).rows[0].ok, false);
    await db.query("UPDATE public.strava_locks SET expires_at = now() - interval '1 second'");
    assert.equal((await db.query("SELECT public.claim_strava_lock($1,$2) AS ok", [user, second])).rows[0].ok, true);
    await db.query("DELETE FROM public.strava_locks WHERE user_id=$1 AND token=$2", [user, first]);
    assert.equal((await db.query("SELECT token FROM public.strava_locks")).rows[0].token, second);
  } finally { await db.close(); }
});

const garminActivity = (extra = {}) => ({ id: 987, athlete: { id: 7 }, name: "Forza Garmin", sport_type: "WeightTraining",
  external_id: "garmin_push_987", start_date: "2026-10-03T16:00:07Z", utc_offset: 7200,
  elapsed_time: 3607, has_heartrate: true, average_heartrate: 112.4, max_heartrate: 155, ...extra });
const heartStreams = { time: { data: [0, 4, 30, 1800, 3607] }, heartrate: { data: [90, 0, 120, 155, 100] } };

test("imports Garmin duration and paired HR samples, then uploads exact timing with GymTrack sets", async () => {
  const b = backend(); b.connect("activity:read_all,activity:write");
  b.upstream(async (url) => Response.json(url.includes("/streams?") ? heartStreams : garminActivity()));
  const result = await b.send({ action: "import-activity", activityId: "987" });
  assert.equal(result.status, 200);
  assert.equal(result.body.importedActivity.elapsedTime, 3607);
  assert.equal(result.body.importedActivity.sampleCount, 4);
  assert.equal(result.body.importedActivity.averageHeartRate, 112.4);
  const status = (await b.send({ action: "status" })).body;
  assert.equal(status.canReadActivities, true);
  assert.equal(status.importedActivity.id, "987");
  assert.equal(status.importedActivity.streams, undefined);
  assert.equal(JSON.stringify(status).includes("access_token"), false);
  b.upstream(async () => Response.json({ id_str: "123", activity_id: 456 }));
  // Client-supplied timing and streams are ignored when using the server snapshot.
  const published = await b.send({ action: "publish", name: "Palestra", useImportedActivity: true,
    elapsedTime: 1, startTime: "2026-10-03T00:00:00Z", streams: { time: [0], heartrate: [1] } });
  assert.equal(published.body.publication.status, "published");
  const file = JSON.parse(await b.calls.at(-1).body.get("file").text());
  assert.equal(file.start_time, "2026-10-03T16:00:07Z");
  assert.equal(file.elapsed_time, 3607);
  assert.equal(file.utc_offset, 7200);
  assert.deepEqual(file.streams, { time: [0, 30, 1800, 3607], heartrate: [90, 120, 155, 100] });
  assert.equal(file.sets[0].exercise_type, "SQUAT_GENERIC");
  assert.equal(b.calls.filter((call) => call.method === "DELETE").length, 0);
});

test("lists paginated activities on their local date, excluding GymTrack uploads and other days", async () => {
  const b = backend(); b.connect("activity:read_all,activity:write");
  b.upstream(async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.pathname, "/api/v3/athlete/activities");
    if (parsed.searchParams.get("page") === "1") return Response.json(Array.from({ length: 100 }, () => garminActivity({ start_date: "2026-10-02T00:00:00Z" })));
    return Response.json([garminActivity({ start_date: "2026-10-02T22:15:00Z" }),
      garminActivity({ id: 988, external_id: "gymtrack-alice-2026-10-03.json" }),
      garminActivity({ id: 989, start_date: "2026-10-03T23:00:00Z" })]);
  });
  const result = await b.send({ action: "activities" });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.activities.map((activity) => activity.id), ["987"]);
  assert.equal(b.calls.length, 2);
});

test("imports require read permission, verified ownership, matching date and valid activity IDs", async () => {
  const b = backend(); b.connect();
  assert.equal((await b.send({ action: "activities" })).status, 403);
  assert.equal((await b.send({ action: "import-activity", activityId: "987" })).status, 403);
  assert.equal(b.calls.length, 0);
  b.tables.strava_connections[0].scope = "activity:read_all,activity:write";
  assert.equal((await b.send({ action: "import-activity", activityId: "../athlete" })).status, 400);
  b.upstream(async () => Response.json(garminActivity({ athlete: { id: 99 } })));
  assert.equal((await b.send({ action: "import-activity", activityId: "987" })).status, 403);
  b.upstream(async () => Response.json(garminActivity({ start_date: "2026-10-02T16:00:00Z" })));
  assert.equal((await b.send({ action: "import-activity", activityId: "987" })).status, 400);
  b.upstream(async () => Response.json(garminActivity({ external_id: "gymtrack-alice-2026-10-03.json" })));
  assert.equal((await b.send({ action: "import-activity", activityId: "987" })).status, 400);
  assert.equal(b.tables.strava_imports.length, 0);
  assert.equal((await b.send({ action: "publish", name: "Palestra", useImportedActivity: true })).status, 400);
});

test("missing HR imports duration alone; malformed streams and upstream errors preserve the previous snapshot", async () => {
  const b = backend(); b.connect("activity:read_all,activity:write");
  b.upstream(async (url) => url.includes("/streams?") ? Response.json({}, { status: 404 }) : Response.json(garminActivity()));
  assert.equal((await b.send({ action: "import-activity", activityId: "987" })).body.importedActivity.sampleCount, 0);
  const before = JSON.stringify(b.tables.strava_imports);
  for (const [times, bpm] of [[[0, 10], [90]], [[10, 0], [90, 100]], [[0, 4000], [90, 100]], [[0, 1.5], [90, 100]]]) {
    b.upstream(async (url) => Response.json(url.includes("/streams?") ? { time: { data: times }, heartrate: { data: bpm } } : garminActivity()));
    assert.equal((await b.send({ action: "import-activity", activityId: "987" })).status, 502);
    assert.equal(JSON.stringify(b.tables.strava_imports), before);
  }
  b.upstream(async () => Response.json({}, { status: 429 }));
  assert.equal((await b.send({ action: "activities" })).status, 429);
  assert.equal((await b.send({ action: "import-activity", activityId: "987" })).status, 429);
  assert.equal(JSON.stringify(b.tables.strava_imports), before);
  b.upstream(async () => Response.json({ id_str: "123", activity_id: 456 }));
  await b.send({ action: "publish", name: "Palestra", useImportedActivity: true });
  assert.equal(JSON.parse(await b.calls.at(-1).body.get("file").text()).streams, undefined);
});

test("duplicate rejection can be retried from the saved snapshot without re-reading the deleted source", async () => {
  const b = backend(); b.connect("activity:read_all,activity:write");
  b.upstream(async (url) => Response.json(url.includes("/streams?") ? heartStreams : garminActivity()));
  await b.send({ action: "import-activity", activityId: "987" });
  b.upstream(async () => Response.json({ message: "duplicate of activity 987" }, { status: 400 }));
  const rejected = await b.send({ action: "publish", name: "Palestra", useImportedActivity: true });
  assert.equal(rejected.body.publication.status, "failed");
  assert.match(rejected.body.publication.error, /duplicato.*salvati/);
  const rejectedForm = b.calls.at(-1).body;
  const rejectedId = rejectedForm.get("external_id");
  const rejectedFile = await rejectedForm.get("file").text();
  b.upstream(async (url) => {
    assert.ok(url.endsWith("/uploads"), "retry must not fetch the original activity");
    return Response.json({ id_str: "124", activity_id: 457 });
  });
  assert.equal((await b.send({ action: "publish", name: "Palestra", useImportedActivity: true })).body.publication.status, "published");
  assert.notEqual(b.calls.at(-1).body.get("external_id"), rejectedId);
  assert.equal(await b.calls.at(-1).body.get("file").text(), rejectedFile);
  assert.equal(JSON.parse(await b.calls.at(-1).body.get("file").text()).streams.heartrate.length, 4);
  assert.equal(b.tables.strava_imports.length, 1);
  assert.equal((await b.send({ action: "import-activity", activityId: "987" })).status, 409);
});

test("duplicates detected during asynchronous processing remain retryable and preserve the imported data", async () => {
  const b = backend(); b.connect("activity:read_all,activity:write");
  b.upstream(async (url) => Response.json(url.includes("/streams?") ? heartStreams : garminActivity()));
  await b.send({ action: "import-activity", activityId: "987" });
  b.upstream(async () => Response.json({ id_str: "123", activity_id: null, error: null }, { status: 201 }));
  assert.equal((await b.send({ action: "publish", name: "Palestra", useImportedActivity: true })).body.publication.status, "processing");
  b.upstream(async () => Response.json({ id_str: "123", activity_id: null, error: "duplicate of activity 987" }));
  const checked = await b.send({ action: "upload-status" });
  assert.equal(checked.body.publication.status, "failed");
  assert.match(checked.body.publication.error, /duplicato.*salvati/);
  assert.match(checked.body.publication.error, /attività 987/);
  assert.equal(b.tables.strava_imports[0].activity.sampleCount, 4);
  // An explicit recheck can reconcile a failed upload without uploading again.
  b.upstream(async (url) => {
    assert.ok(url.endsWith("/uploads/123"));
    return Response.json({ id_str: "123", activity_id: 456, error: null });
  });
  assert.equal((await b.send({ action: "upload-status" })).body.publication.status, "published");
});

test("imported data stays isolated by user and athlete, and disconnect clears the snapshot", async () => {
  const b = backend(); b.connect("activity:read_all,activity:write");
  b.upstream(async () => Response.json(garminActivity({ has_heartrate: false, average_heartrate: undefined, max_heartrate: undefined })));
  await b.send({ action: "import-activity", activityId: "987" });
  b.setUser("bob");
  assert.equal((await b.send({ action: "status" })).body.importedActivity, null);
  b.setUser("alice");
  b.tables.strava_connections[0].athlete_id = 99;
  assert.equal((await b.send({ action: "status" })).body.importedActivity, null);
  assert.equal((await b.send({ action: "publish", name: "Palestra", useImportedActivity: true })).status, 400);
  b.tables.strava_connections[0].athlete_id = 7;
  await b.send({ action: "disconnect" });
  assert.equal(b.tables.strava_imports.length, 0);
});
