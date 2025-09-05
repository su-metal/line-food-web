// web/api/_lib/sb.js (ESM)
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SB_URL || !SB_KEY) {
  // 起動時に分かるように throw はせず、後段で 500 返す
  console.warn('[sb] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
}

export function sbUrl(path) {
  return (SB_URL || '').replace(/\/$/, '') + path;
}

export async function sbFetch(pathWithQuery, init = {}) {
  if (!SB_URL || !SB_KEY) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_KEY are not set');
  }
  const headers = {
    apikey: SB_KEY,
    authorization: `Bearer ${SB_KEY}`,
    'content-type': 'application/json; charset=utf-8',
    ...init.headers,
  };
  const res = await fetch(sbUrl(pathWithQuery), { ...init, headers });
  return res;
}
