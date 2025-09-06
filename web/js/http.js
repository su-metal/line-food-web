// web/js/http.js
import { CONFIG } from './config.js';
const DEBUG = location.search.includes('debug=1');

function isExpired(idToken, skewSec = 30) {
  try {
    const p = idToken.split('.')[1];
    const s = p.replace(/-/g,'+').replace(/_/g,'/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const payload = JSON.parse(atob(s + pad));
    const now = Math.floor(Date.now()/1000);
    return typeof payload.exp === 'number' ? (payload.exp - skewSec) <= now : true;
  } catch { return true; }
}

export async function ensureIdToken() {
  await liff.ready;
  if (!liff.isLoggedIn()) {
    if (DEBUG) console.debug('[liff] not logged in → login');
    await liff.login();
    return null;
  }
  let tok = liff.getIDToken();
  if (!tok || isExpired(tok)) {
    if (DEBUG) console.debug('[liff] token missing/expired → re-login');
    liff.logout();
    await liff.login(); // ここでリダイレクト → 復帰後は新トークン
    return null;
  }
  return tok;
}

export async function apiFetch(path, init = {}) {
  const tok = await ensureIdToken();
  const headers = new Headers(init.headers || {});
  if (tok) headers.set('Authorization', `Bearer ${tok}`);
  const res = await fetch(`${CONFIG.API_BASE}${path}`, { ...init, headers, credentials:'include' });
  if (DEBUG) console.debug('[RES]', res.status, path);
  return res;
}

export async function apiJSON(path, init = {}) {
  const r = await apiFetch(path, init);
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { ok:false, error:'Invalid JSON', raw:t }; }
  if (!r.ok) throw Object.assign(new Error(j.error || r.statusText), { status:r.status, body:j });
  return j;
}
