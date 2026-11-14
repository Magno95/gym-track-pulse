import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8');
const projectRef = config.match(/^project_id\s*=\s*"([a-z]{20})"/m)?.[1];
const dryRun = process.argv.includes('--dry-run');
const required = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_URL'];
const missing = required.filter(key => !process.env[key]?.trim());
if (missing.length) throw new Error(`Missing local credentials: ${missing.join(', ')}. See docs/migrazione-supabase-personale.md.`);
if (!projectRef || new URL(process.env.SUPABASE_URL).origin !== `https://${projectRef}.supabase.co`) {
  throw new Error('SUPABASE_URL must match project_id in supabase/config.toml. No deployment performed.');
}

// Use the pinned project dependency, never a global CLI or a shell command.
const cli = fileURLToPath(new URL('../node_modules/supabase/dist/supabase.js', import.meta.url));
const secrets = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_PASSWORD', 'SUPABASE_SECRET_KEY', 'STRAVA_CLIENT_SECRET']
  .map(key => process.env[key]).filter(Boolean);
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, env: process.env, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  for (const output of [result.stdout, result.stderr]) {
    if (output) process.stdout.write(secrets.reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), output));
  }
  if (result.error || result.status !== 0) {
    throw new Error(`Supabase ${args[0]} failed; deployment stopped.`);
  }
}

console.log(`${dryRun ? 'Checking' : 'Deploying'} backend ${projectRef}`);
run(['link', '--project-ref', projectRef]);
run(['db', 'push', '--linked', dryRun ? '--dry-run' : '--yes']);
if (!dryRun) run(['functions', 'deploy', 'strava', '--project-ref', projectRef, '--use-api']);
console.log(dryRun ? 'Migration check completed. No schema or function changes applied.' : 'Backend deployed. The frontend can now be published.');
