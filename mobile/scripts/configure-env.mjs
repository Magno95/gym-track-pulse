import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

// Copy only the two public frontend settings. Never copy server credentials.
const source = parseEnv(await readFile(new URL('../../.env', import.meta.url), 'utf8'));
const url = source.VITE_SUPABASE_URL;
const key = source.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key || key.startsWith('sb_secret_')) {
  throw new Error('Configurazione pubblica Supabase assente o non valida nel file .env della web app.');
}
if (!key.startsWith('sb_publishable_')) {
  const role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
  if (role !== 'anon') throw new Error('È consentita solo una chiave pubblicabile o anon.');
}
await writeFile(new URL('../.env.local', import.meta.url),
  `EXPO_PUBLIC_SUPABASE_URL=${JSON.stringify(url)}\nEXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(key)}\n`,
  { mode: 0o600 });
console.log('Configurazione pubblica copiata in mobile/.env.local (ignorato da Git).');
