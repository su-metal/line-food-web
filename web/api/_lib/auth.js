export async function getUserId(req) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return null;
  const idToken = auth.slice(7).trim();

  const clientId = process.env.LINE_LOGIN_CHANNEL_ID; // ← Vercel 環境変数に設定
  if (!clientId) return null;

  try {
    const body = new URLSearchParams();
    body.set('id_token', idToken);
    body.set('client_id', clientId);
    const r = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body
    });
    if (!r.ok) return null;
    const claims = await r.json();
    return claims?.sub || null;
  } catch { return null; }
}
