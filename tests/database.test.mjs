import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

test("actual migrations enforce ownership, validation, atomicity, idempotency and bounded overviews", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
        'SELECT nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      GRANT USAGE ON SCHEMA auth TO anon, authenticated;
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text,
        owner_id text DEFAULT auth.uid()::text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      GRANT USAGE ON SCHEMA storage, public TO anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
    `);
    const migrations = new URL("../supabase/migrations/", import.meta.url);
    const legacyOwner = webcrypto.randomUUID(), legacyExercise = webcrypto.randomUUID(), legacySession = webcrypto.randomUUID();
    let legacyChecksum;
    for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
      if (file === "20261003000000_security_sync_performance.sql") {
        await db.query("INSERT INTO auth.users VALUES ($1)", [legacyOwner]);
        await db.query("INSERT INTO public.exercises(id,user_id,name,category) VALUES ($1,$2,'Legacy','legs')", [legacyExercise, legacyOwner]);
        await db.query(`INSERT INTO public.sessions(id,exercise_id,date,series,reps,weight,value,sets,superset_id,is_superset_secondary)
          VALUES ($1,$2,'2026-09-01',1,10,20,240,'[{"reps":10,"weight":20}]',$3,true)`, [legacySession, legacyExercise, webcrypto.randomUUID()]);
        await db.query(`INSERT INTO public.sessions(exercise_id,date,series,reps,weight,value,sets)
          VALUES ($1,'2026-08-01',1,10,20,777,'[]')`, [legacyExercise]);
        legacyChecksum = (await db.query("SELECT md5(string_agg((to_jsonb(s) - 'value_multiplier')::text, '' ORDER BY id)) AS checksum FROM public.sessions s")).rows[0].checksum;
      }
      await db.exec(readFileSync(new URL(file, migrations), "utf8"));
    }
    const verification = await db.exec(readFileSync(new URL("../supabase/verify_security_sync_performance.sql", import.meta.url), "utf8"));
    assert.equal(verification[0].rows.length, 13);
    for (const check of verification[0].rows) assert.equal(check.ok, true, check.check_name);
    const timedVerification = await db.exec(readFileSync(new URL("../supabase/verify_timed_bodyweight.sql", import.meta.url), "utf8"));
    assert.equal(timedVerification[0].rows.length, 6);
    for (const check of timedVerification[0].rows) assert.equal(check.ok, true, check.check_name);
    const registration = readFileSync(new URL("../supabase/register_security_sync_performance.sql", import.meta.url), "utf8");
    await db.exec(registration); await db.exec(registration);
    const timedRegistration = readFileSync(new URL("../supabase/register_timed_bodyweight.sql", import.meta.url), "utf8");
    await db.exec(timedRegistration); await db.exec(timedRegistration);
    assert.deepEqual((await db.query("SELECT version FROM supabase_migrations.schema_migrations ORDER BY version")).rows,
      [{ version: "20261003000000" }, { version: "20261003001000" }, { version: "20261003002000" }]);
    assert.equal((await db.query("SELECT md5(string_agg((to_jsonb(s) - 'value_multiplier')::text, '' ORDER BY id)) AS checksum FROM public.sessions s")).rows[0].checksum, legacyChecksum);
    const legacy = (await db.query("SELECT value,value_multiplier FROM public.sessions WHERE id=$1", [legacySession])).rows[0];
    assert.equal(Number(legacy.value), 240); assert.equal(Number(legacy.value_multiplier), 1.2);
    await db.query(`INSERT INTO public.sessions(exercise_id,date,series,reps,weight,value,sets,superset_id,is_superset_secondary)
      VALUES ($1,'2026-10-02',1,10,20,999,'[{"reps":10,"weight":20}]',$2,true)`, [legacyExercise, webcrypto.randomUUID()]);
    assert.equal(Number((await db.query("SELECT value FROM public.sessions WHERE exercise_id=$1 AND date='2026-10-02'", [legacyExercise])).rows[0].value), 240);
    const alice = webcrypto.randomUUID(), bob = webcrypto.randomUUID();
    const exercise = webcrypto.randomUUID(), second = webcrypto.randomUUID(), session = webcrypto.randomUUID();
    await db.query("INSERT INTO auth.users VALUES ($1), ($2)", [alice, bob]);
    const login = async (id) => {
      await db.exec("RESET ROLE");
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [id]);
      await db.exec("SET ROLE authenticated");
    };
    await login(alice);
    await db.query("INSERT INTO public.exercises(id,user_id,name,category) VALUES ($1,$2,'Squat','legs'), ($3,$2,'Row','back')", [exercise, alice, second]);
    const image = `${alice}/${exercise}/image.webp`;
    await db.query("INSERT INTO storage.objects(bucket_id,name) VALUES ('exercise-images',$1)", [image]);
    await assert.rejects(db.query("UPDATE storage.objects SET owner_id=$1 WHERE name=$2", [bob, image]), /row-level security/);
    await assert.rejects(db.query("UPDATE public.exercises SET user_id=$1 WHERE id=$2", [bob, exercise]), /row-level security/);
    await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('exercise-images',$1,$2)", [`${bob}/forged.webp`, bob]), /row-level security/);
    await assert.rejects(db.query("INSERT INTO public.exercises(user_id,name,category) VALUES ($1,'   ','legs')", [alice]), /exercises_name_valid/);
    await assert.rejects(db.query("UPDATE public.exercises SET personal_records='[{\"text\":\"PR\",\"date\":\"2026-02-30\"}]' WHERE id=$1", [exercise]), /exercises_records_valid/);
    const insert = "INSERT INTO public.sessions(id,exercise_id,date,series,reps,weight,value,sets) VALUES ($1,$2,$3,99,99,999,999,$4)";
    const sets = JSON.stringify([{ reps: 10, weight: 85, body_weight: 80, additional_weight: 5 }]);
    await db.query(insert, [session, exercise, "2026-10-02", sets]);
    const saved = (await db.query("SELECT series,reps,weight,value,sets FROM public.sessions WHERE id=$1", [session])).rows[0];
    assert.equal(saved.series, 1); assert.equal(saved.reps, 10); assert.equal(Number(saved.weight), 85); assert.equal(Number(saved.value), 850);
    assert.deepEqual(saved.sets, JSON.parse(sets));
    await assert.rejects(db.query(insert, [webcrypto.randomUUID(), exercise, "2026-10-02", '[{"reps":1.5,"weight":20}]']), /Invalid session sets/);
    await assert.rejects(db.query(insert, [webcrypto.randomUUID(), exercise, "2026-10-02", '[{"reps":10,"weight":85,"body_weight":70,"additional_weight":5}]']), /Invalid session sets/);
    const pair = webcrypto.randomUUID(), primary = webcrypto.randomUUID(), secondary = webcrypto.randomUUID();
    const pairSQL = `INSERT INTO public.sessions(id,exercise_id,date,series,reps,weight,value,sets,superset_id,is_superset_secondary,value_multiplier)
      VALUES ($1,$3,'2026-10-01',1,1,1,1,$5,$7,false,1), ($2,$4,'2026-10-01',1,1,1,1,$6,$7,true,1.2) ON CONFLICT (id) DO NOTHING`;
    await assert.rejects(db.query(pairSQL, [primary, secondary, exercise, second, sets, '[]', pair]), /Invalid session sets/);
    assert.equal((await db.query("SELECT count(*)::int AS count FROM public.sessions WHERE id=$1", [primary])).rows[0].count, 0);
    await db.query(pairSQL, [primary, secondary, exercise, second, sets, sets, pair]);
    await db.query("UPDATE public.sessions SET sets='[{\"reps\":12,\"weight\":85}]' WHERE id=$1", [primary]);
    await db.query(pairSQL, [primary, secondary, exercise, second, sets, sets, pair]);
    assert.equal(Number((await db.query("SELECT value FROM public.sessions WHERE id=$1", [primary])).rows[0].value), 1020);
    assert.equal(Number((await db.query("SELECT value FROM public.sessions WHERE id=$1", [secondary])).rows[0].value), 1020);
    await db.query(insert, [webcrypto.randomUUID(), exercise, "2026-09-01", sets]);
    const overview = (await db.query("SELECT * FROM public.get_exercise_overview($1)", [alice])).rows;
    assert.equal(overview.find((row) => row.exercise.id === exercise).sessions.length, 2);
    assert.equal(overview.find((row) => row.exercise.id === exercise).sessions.at(-1).id, session);
    assert.equal((await db.query("SELECT * FROM public.get_exercise_overview($1)", [bob])).rows.length, 0);
    await login(bob);
    assert.equal((await db.query("SELECT * FROM public.exercises")).rows.length, 0);
    assert.equal((await db.query("SELECT * FROM public.sessions")).rows.length, 0);
    assert.equal((await db.query("UPDATE storage.objects SET name='stolen.webp' WHERE name=$1 RETURNING id", [image])).rows.length, 0);
    assert.equal((await db.query("DELETE FROM storage.objects WHERE name=$1 RETURNING id", [image])).rows.length, 0);
    await assert.rejects(db.query(insert, [webcrypto.randomUUID(), exercise, "2026-10-02", sets]), /row-level security/);
    await login(alice);
    assert.equal((await db.query("DELETE FROM storage.objects WHERE name=$1 RETURNING id", [image])).rows.length, 1);
    const plank = webcrypto.randomUUID();
    await db.query("INSERT INTO public.exercises(id,user_id,name,category,unit,is_bodyweight) VALUES ($1,$2,'Plank','core','time',true)", [plank, alice]);
    const timedSets = JSON.stringify([{ reps: 120, weight: 80, body_weight: 80, additional_weight: 0, duration_seconds: 120 }]);
    await db.query(insert, [webcrypto.randomUUID(), plank, "2026-10-03", timedSets]);
    const timed = (await db.query("SELECT reps,weight,value,sets FROM public.sessions WHERE exercise_id=$1", [plank])).rows[0];
    assert.equal(timed.reps, 120); assert.equal(Number(timed.weight), 80); assert.equal(Number(timed.value), 9600);
    assert.deepEqual(timed.sets, JSON.parse(timedSets));
    await assert.rejects(db.query("UPDATE public.exercises SET unit='distance' WHERE id=$1", [plank]), /bodyweight_requires_/);
    await assert.rejects(db.query(insert, [webcrypto.randomUUID(), plank, "2026-10-03", '[{"reps":60,"weight":80,"body_weight":80,"additional_weight":0,"duration_seconds":61}]']), /Invalid session sets/);
    await assert.rejects(db.query(insert, [webcrypto.randomUUID(), plank, "2026-10-03", '[{"reps":60,"weight":80,"duration_seconds":60}]']), /Invalid session sets/);
    await db.exec("RESET ROLE; SET ROLE anon");
    await assert.rejects(db.query("SELECT * FROM public.get_exercise_overview($1)", [alice]), /permission denied/);
  } finally { await db.close(); }
});
