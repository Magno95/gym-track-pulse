# GymTrack

GymTrack is a workout journal for managing exercises, logging sets and supersets, tracking progress, and keeping a body weight history. It includes a web client and an iPhone client built with React Native + Expo, both connected to the same Supabase backend.

The project started with Lovable; the web frontend is deployed on Netlify. Each installation can use its own Supabase project. User credentials and personal data are not required to build the code.

## Using the app

### Account and profile

1. Open the app and choose **Sign Up** to register with an email and password, or **Sign In** to log in. If the backend requires email confirmation, complete verification first.
2. Open **Profile** using the user icon. You can enter your height and log body weight measurements with an effective date.
3. Bodyweight exercises require a measurement valid on the workout date. That historical weight is saved with new sets: later profile changes do not automatically rewrite previous workouts.

### Exercises and workouts on the web

1. In **Exercises**, search for an exercise or browse the categories: arms, chest, back, legs, core, and cardio.
2. Select **+ → New exercise** to add a name and category to your library. Open the exercise details to manage its properties and image.
3. To log a workout, select **+ → Log session**, choose an exercise, and set the date. Enter repetitions and load for each set; use seconds for timed exercises. **Add Set** adds a set and saves the session; wait for confirmation in the interface.
4. Enable **Super Set** to pair a second exercise and enter its sets. The app applies the displayed multiplier and synchronizes the group in a single atomic operation.
5. **Sessions** groups workouts by day. Open a day to view its details; open an exercise to view its history and progress chart and edit logged entries.

The **Session Score** is an internal metric: it sums repetitions × load across sets, applying the multiplier where relevant. For bodyweight exercises, load includes body weight valid on that date plus any added load; timed bodyweight exercises use seconds × load. It does not represent calories or a clinical measurement and combines different units.

### Offline saves

Supported changes are saved to a local queue before being synchronized with Supabase. The status banner shows pending operations and lets you retry or export those belonging to the current account if an error occurs. A local save does not mean the server has already received the data.

An internet connection is required for the first login and remote operations. Web queues are stored in IndexedDB in each browser and kept separate by account; they are not transferred to the iPhone client. Wait for synchronization before clearing browser data or switching devices. Legacy global queues without an owner require separate recovery and are not submitted automatically.

### Strava

From the details of a synchronized workout day, you can connect Strava and choose to publish a new strength training activity. Connecting an account alone does not publish anything. You can enter a start time and duration manually or import duration and heart rate from an existing Strava activity, such as one synchronized from Garmin.

Importing does not change the original activity: publishing creates a new one, which Strava may reject as a duplicate. Review the summary and visibility before submitting. Publishing remains blocked while local changes are awaiting synchronization. See [docs/strava.md](docs/strava.md) for configuration, exercise mappings, and retry handling.

### iPhone client

The client in [mobile/](mobile/README.md) uses the same account and database. It includes the exercise library, an ongoing workout session, supersets, charts, measurements, SQLite offline synchronization, and Strava. It also adds a stopwatch, rest timers, local notifications, and Live Activities on compatible devices. See its dedicated README for installation, builds, and the limits of device testing. Native extensions require a build that includes them.

## Technical architecture

| Layer | Technologies and responsibilities |
| --- | --- |
| Web | React 18, strict TypeScript, Vite, React Router; screens loaded through dynamic imports |
| UI | Tailwind CSS 4, shadcn/ui and Radix components, React Hook Form + Zod forms, Recharts charts |
| Web data and synchronization | TanStack Query for queries and caching; IndexedDB through `idb` for a persistent queue and retries |
| Backend | Supabase Auth, PostgreSQL with Row Level Security, RPCs, and Storage for images |
| Strava | Supabase Edge Function in TypeScript, OAuth, imports and uploads; tokens stored on the backend |
| iPhone | React Native + Expo, Expo Router, and a SQLite queue; domain modules shared with the web client |
| Deployment | Static web output in `dist/`; backend deployed separately through the Supabase CLI |

The browser communicates with Supabase using the publishable key and the user's JWT. RLS and ownership checks isolate account data. When the user changes, the app cancels previous queries, clears the in-memory cache, and resets forms; pending operations remain associated with their owner.

Stable UUIDs make queue retries idempotent; coordination between browser tabs limits concurrent submissions. Exercise images are publicly readable: do not upload private images. Writes are restricted to the owner; new uploads use paths scoped to each user, resized WebP images, and thumbnails.

The Strava function verifies identity with `auth.getUser` and manages expiring, single-use OAuth state, token refresh, and persistent publication status. Token tables are accessible only to the backend through the `service_role` role.

### Repository structure

```text
src/pages/                 Web screens and OAuth callback
src/components/            Components, forms, and UI
src/hooks/                 Queries and synchronization
src/lib/                   Domain logic, validation, cache, and offline queue
src/integrations/supabase/ Supabase client and database types
supabase/migrations/       Schema, RLS policies, SQL functions, and indexes
supabase/functions/        Strava Edge Function and shared modules
supabase/verify_*.sql       SQL checks to run against your backend
mobile/                    iPhone client with separate setup and checks
scripts/                   Backend deployment and bundle statistics
tests/                     Web, domain, queue, query, and database tests
tools/lovable-tagger/      Local Lovable plugin adaptation for Tailwind 4
```

## Running the web app locally

Requirements: **Node.js 24+**, **npm 11**, and a Supabase project. `package-lock.json` is the reference lockfile; keep `tools/lovable-tagger` in your checkout, as installation requires this local dependency.

```sh
npm ci
cp .env.example .env
# Set your own Supabase project URL and publishable key in .env.
npm run dev
```

The server configured in `vite.config.ts` uses port **5174** and listens on `0.0.0.0`, so it may be reachable from your local network. Open `http://localhost:5174`. The port is fixed: if it is occupied, Vite exits with an error.

| Frontend variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Your project's publishable key or legacy `anon` key |

All `VITE_*` variables are included in the client: never use them for passwords, personal tokens, secret keys, or `service_role` keys. Project URLs and publishable keys do not replace RLS policies. For the iPhone client, use [mobile/.env.example](mobile/.env.example) and the `EXPO_PUBLIC_SUPABASE_*` variables described in the mobile guide.

### Setting up the backend

1. Create your own Supabase project and replace `project_id` in `supabase/config.toml` with its project reference.
2. Configure Supabase Auth: the Site URL and allowed redirects must match the origin used by the frontend. For the current local web setup, use `http://localhost:5174`, or `http://127.0.0.1:5174` if you open that address.
3. Apply migrations in order using the CLI included in the project:

   ```sh
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push --linked --dry-run
   npx supabase db push --linked
   ```

4. Run the relevant `supabase/verify_*.sql` scripts to check the schema, policies, and functions. Migrations do not import personal data or production backups. Do not manually rerun migrations that have already been applied; the `register_*.sql` scripts are only for recording migrations applied manually through SQL.
5. If you want to use Strava, configure `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_APP_URL` in the function's secrets, then deploy it as described in [docs/strava.md](docs/strava.md). Use your own domain and the `/strava/callback` path; locally, also adjust `STRAVA_APP_URL` to the actual origin and port. The runtime provides the Supabase variables required by the function.

Alternatively, `npm run backend:deploy` uses credentials from the local `.env.production` file: start with [.env.production.example](.env.production.example), configure your project, and run `npm run backend:deploy -- --dry-run` first. The script checks that `SUPABASE_URL` matches `project_id`, applies new migrations, and deploys the Strava function. It does not configure Strava secrets or publish the frontend. The [original installation's migration procedure](docs/migrazione-supabase-personale.md) documents operations specific to that environment.

### Building and hosting

```sh
npm run build
npm run preview
```

The build runs type checking and generates `dist/`. On Netlify, set the build command to `npm run build` and the publish directory to `dist`; provide only the public frontend variables. [public/_redirects](public/_redirects) contains the SPA rewrite needed to open pages and `/strava/callback` directly. On other hosting platforms, configure an equivalent rewrite to `index.html`.

Apply the migrations required by the version you are deploying first. `npm run build` does not modify the database or deploy Edge Functions.

## Development checks

```sh
npm run lint
npm test
npm run build
npm audit --audit-level=moderate
npm run bundle:stats
```

Tests cover the queue on simulated IndexedDB, hooks and queries, account isolation, workout logic, and the Strava integration; migrations run on PostgreSQL through PGlite. They do not fully emulate production HTTP, Storage, or external services. The mobile client has separate commands and checks in its README.

`bundle:stats` requires a previous build and totals the JavaScript modules needed to start each screen, including shared static dependencies; it excludes later dynamic imports. Web CI runs installation, lint, tests, build, and audit on Node 24. A separate workflow increments the patch version on pushes to `main` unless the commit contains `[skip version bump]`.

## Configuration and publishing the source

Keep `.env`, `.env.production`, `supabase/functions/.env`, mobile environment files, and local backups out of Git. Only version examples without credentials. Do not upload `.env.production` to frontend hosting or use it as a complete set of function secrets.

The secret scan results, scope, and limitations are recorded in [docs/verifica-segreti-2026-11-14.md](docs/verifica-segreti-2026-11-14.md). The report documents the legacy Supabase `anon` key present in Git history. The scan covers source files and does not replace checking your backend's policies.

## Further documentation

The following guides are currently in Italian:

- [Profiles, body weight, and set snapshots](docs/bodyweight.md).
- [Strava configuration, imports, and publishing](docs/strava.md).
- [iPhone client guide and architecture](mobile/README.md).
- [Performance and security analysis — October 2, 2026](docs/analisi-prestazioni-sicurezza-2026-10-02.md).
- [Fixes, account isolation, and checks — October 3, 2026](docs/correzioni-prestazioni-sicurezza-2026-10-03.md).
- [Original backend migration](docs/migrazione-supabase-personale.md).
