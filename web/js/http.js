// web/js/http.js
import { CONFIG } from './config.js';

const DEBUG = location.search.includes('debug=1');

export async function ensureIdToken() {
  await liff.ready;
  if (!liff.isLoggedIn()) { await liff.login(); return null; }
  const tok = liff.getIDToken();
  if (DEBUG) console.debug('[token]', !!tok, tok && tok.slice(0,16)+'...');
  return tok;
}

export async function apiFetch(path, init = {}) {
  const tok = await ensureIdToken();
  const headers = new Headers(init.headers || {});
  if (tok) headers.set('Authorization', `Bearer ${tok}`);
  const res = await fetch(`${CONFIG.API_BASE}${path}`, {
    ...init,
    headers,
    credentials: 'include'
  });
  if (DEBUG) console.debug('[RES]', res.status, path);
  return res;
}

export async function apiJSON(path, init = {}) {
  const r = await apiFetch(path, init);
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { ok:false, error:'Invalid JSON', raw: t }; }
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status: r.status, body: j });
  return j;
}
