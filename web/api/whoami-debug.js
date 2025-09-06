// web/api/whoami-debug.js
export default async function handler(req, res) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;

  let aud=null, sub=null, iss=null, exp=null, parseErr=null;
  if (token) {
    try {
      const seg = token.split('.')[1] || '';
      const s = seg.replace(/-/g,'+').replace(/_/g,'/');
      const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
      const json = atob(s + pad);
      const p = JSON.parse(json);
      aud = p.aud; sub = p.sub; iss = p.iss; exp = p.exp;
    } catch(e){ parseErr = String(e?.message||e); }
  }

  const L1 = process.env.LINE_LOGIN_CHANNEL_ID || null;
  const L2 = process.env.LINE_CHANNEL_ID || null;

  res.statusCode = token ? 200 : 401;
  res.setHeader('content-type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify({
    ok: !!token,
    token_present: !!token,
    aud, sub, iss, exp, parseErr,
    env: { LINE_LOGIN_CHANNEL_ID: L1, LINE_CHANNEL_ID: L2 },
    match: { with_LOGIN: L1 ? String(aud)===String(L1) : null,
             with_CHANNEL: L2 ? String(aud)===String(L2) : null }
  }));
}
