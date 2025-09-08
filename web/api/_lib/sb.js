// web/api/_lib/sb.js (ESM)
export function sbFetch(path, init = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key)
    throw new Error("Supabase env missing: SUPABASE_URL or SUPABASE_ANON_KEY");
  const u = new URL(path, base);
  const headers = new Headers(init.headers || {});
  headers.set("apikey", key);
  headers.set("Authorization", `Bearer ${key}`);
  if (!headers.has("content-type") && init.body)
    headers.set("content-type", "application/json");
  return fetch(u.toString(), { ...init, headers });
}
export function noStore(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
}
