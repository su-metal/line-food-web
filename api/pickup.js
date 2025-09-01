// /api/pickup.js
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

async function readJson(req) {
  if (req.body) return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

// ① "export default" を付けずに handler を定義
async function handler(req, res) {
  if (req.method === 'OPTIONS') { // 先にここで返してもOK
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const { pickup_code } = await readJson(req);
  if (!pickup_code) return res.status(400).json({ error: 'missing_code' });

  // 予約の照合
  const r = await fetch(`${SB_URL}/rest/v1/reservations?select=*&pickup_code=eq.${pickup_code}&status=eq.reserved`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  const rows = await r.json();
  const rv = rows[0];
  if (!rv) return res.status(400).json({ error: 'invalid_or_used' });

  // 受取済みに変更
  await fetch(`${SB_URL}/rest/v1/reservations?id=eq.${rv.id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ status: 'picked_up', picked_up_at: new Date().toISOString() })
  });

  return res.status(200).json({ ok: true });
}

// ② CORSラッパーを定義
function allowCors(fn){
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    return fn(req, res);
  };
}

// ③ ラップしたものをデフォルトエクスポート
export default allowCors(handler);
