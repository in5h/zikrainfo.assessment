/**
 * App configuration. Everything has a working default so the app deploys with
 * zero environment variables; env vars override.
 */

export const MAIN_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
export const SUBAGENT_MODEL = process.env.ANTHROPIC_SUBAGENT_MODEL || "claude-sonnet-5-5";

/**
 * Built-in demo database. The anon key is Supabase's *public* key; access is
 * governed by the RLS policies in supabase/migrations/0002_demo_access.sql
 * (catalog read-only, demo trips read/write). Set SUPABASE_SERVICE_ROLE_KEY to
 * use the secret server key instead, or WAYFARER_STORAGE=memory to keep trips
 * in the browser with no database at all.
 */
const DEMO_SUPABASE_URL = "https://cadteeytsxhuvjelhlmk.supabase.co";
const DEMO_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhZHRlZXl0c3hodXZqZWxobG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMzM4NzYsImV4cCI6MjEwNjcwOTg3Nn0.iNZHNcyV7Iy8hBBK4xGLF59jkazAJgXnra_08QQWtWY";

export function supabaseConfig(): { url: string; key: string } | null {
  if (process.env.WAYFARER_STORAGE === "memory") return null;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEMO_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    (url === DEMO_SUPABASE_URL ? DEMO_SUPABASE_ANON_KEY : "");
  return url && key ? { url, key } : null;
}

/** Server key wins; otherwise a key sent with the request. null → demo mode (offline planner). */
export function resolveApiKey(fromRequest?: string | null) {
  return process.env.ANTHROPIC_API_KEY || fromRequest?.trim() || null;
}
