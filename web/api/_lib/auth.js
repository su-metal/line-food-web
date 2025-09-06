// web/api/_lib/auth.js
export async function getUserId(req) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return { userId: null, reason: 'no_authorization' };

  const idToken = auth.slice(7).trim();
  const candidates = [process.env.LINE_LOGIN_CHANNEL_ID, process.env.LINE_CHANNEL_ID]
    .map(v => (v || '').trim())
    .filter(Boolean);

  if (!candidates.length) return { userId: null, reason: 'no_client_id_env' };

  const statuses = [];
  for (const clientId of candidates) {
    try {
      const body = new URLSearchParams();
      body.set('id_token', idToken);
      body.set('client_id', clientId);
      const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      statuses.push(`${clientId}:${r.status}`);
      if (!r.ok) continue;
      const claims = await r.json(); // { aud, sub, ... }
      if (claims?.sub) return { userId: claims.sub, reason: null };
    } catch (e) {
      return { userId: null, reason: `verify_exception:${String(e?.message || e)}` };
    }
  }
  return { userId: null, reason: `verify_failed:${statuses.join(',')}` };
}
