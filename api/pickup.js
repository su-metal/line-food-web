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

export default async function handler(req, res) {
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
