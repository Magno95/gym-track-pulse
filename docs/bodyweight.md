# Profiles and bodyweight sessions

Apply `supabase/migrations/20261002223000_profile_bodyweight.sql` to the app's
Supabase project before using profile measurements or changing bodyweight mode.
The migration adds per-user profiles, dated weight history and an exercise default.
It does not modify existing sessions.

The hosted project uses Lovable Cloud. Manage its database from the Lovable
project's **Cloud → SQL editor**, rather than a separate Supabase dashboard.
Migration `20261002223000` was applied there and registered in
`supabase_migrations.schema_migrations` on 2026-10-02.

- Height is stored in centimetres; weights are in kilograms.
- A measurement applies from its local calendar date until the next measurement.
  There is one entry per user per day; saving on the same date corrects that entry.
  New entries default to today, and can be backdated.
- New bodyweight sessions use the latest measurement on or before the workout
  date. A measurement is required; the current weight is never substituted for a
  missing historical weight.
- Each saved set contains effective `weight`, the `body_weight` snapshot and
  `additional_weight`. Effective load is body weight plus added load. Keeping
  effective weight preserves existing volume calculations and superset bonuses.
- The exercise's `is_bodyweight` setting is a default for new recordings.
  Existing sessions retain their mode, including when edited after a conversion.
- Timed exercises such as Plank can also use bodyweight mode after applying
  `20261003002000_timed_bodyweight.sql`. Each new timed set records whole seconds
  (1–10,000) and added load in kg. Its score is seconds × (profile weight + added
  load). A 60-second hold at 80 kg with no added load scores 4,800.
- Timed sets carry `duration_seconds`, equal to the stored `reps` quantity;
  `weight` stays in kg. This snapshot keeps edit fields and display units correct
  even if the exercise's settings change later. Existing manual time sessions
  retain their original seconds and score. Distance exercises remain manual.
- Changes to profile history do not recalculate saved workouts. Changing only reps
  or added load preserves a session's snapshot. Changing the workout date resolves
  the weight valid on the new date.
- Session cache and offline sync preserve the extra set fields. Profile reads are
  cached separately per user; profile writes require a successful server response.
- Retroactive conversion and automatic recalculation of existing workouts are not
  part of this change.

Run `npm test` for date resolution, snapshots, legacy session edits and offline
sync regression tests.

Before publishing the timed-bodyweight frontend, apply the new migration and run
`supabase/verify_timed_bodyweight.sql`: all six checks must be true. Register
version `20261003002000` with `supabase/register_timed_bodyweight.sql` after manual
execution; the Supabase CLI handles registration automatically.

Migration `20261003002000` was applied, verified with all six checks passing and
registered in this Lovable Cloud project on 2026-10-03. Do not apply it again there.
