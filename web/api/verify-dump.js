// web/api/verify-dump.js
export default async function handler(req, res) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  const out = { ok: !!token, token_present: !!token, tries: [] };
  const ids = [process.env.LINE_LOGIN_CHANNEL_ID, process.env.LINE_CHANNEL_ID]
    .map(v => (v || '').trim())
    .filter(Boolean);

  if (!token) {
    res.statusCode = 401;
  } else if (!ids.length) {
    res.statusCode = 500;
    out.error = 'no_client_id_env';
  } else {
    for (const clientId of ids) {
      try {
        const body = new URLSearchParams();
        body.set('id_token', token);
        body.set('client_id', clientId);
        const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body
        });
        const txt = await r.text();
        let json; try { json = JSON.parse(txt); } catch { json = txt; }
        out.tries.push({ clientId, status: r.status, body: json });
      } catch (e) {
        out.tries.push({ clientId, error: String(e?.message || e) });
      }
    }
    res.statusCode = 200;
  }

  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(out));
}
