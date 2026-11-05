import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { createStravaHandler } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const appUrl = Deno.env.get("STRAVA_APP_URL");
if (!appUrl) throw new Error("Set STRAVA_APP_URL before deploying the Strava function.");

Deno.serve(createStravaHandler({ supabaseUrl, appUrl,
  anonKey: Deno.env.get("SUPABASE_ANON_KEY")!,
  clientId: Deno.env.get("STRAVA_CLIENT_ID") ?? "",
  clientSecret: Deno.env.get("STRAVA_CLIENT_SECRET") ?? "",
  callbackUrl: new URL("/strava/callback", appUrl).href,
}, createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })));
