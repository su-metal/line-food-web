// /api/reserve.js
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

  const body = await readJson(req);
  const { offer_id, user_liff_id } = body || {};
  if (!offer_id || !user_liff_id) return res.status(400).json({ error: 'missing_params' });

  // 1) 対象オファー取得
  const offerRes = await fetch(`${SB_URL}/rest/v1/offers?select=*&id=eq.${offer_id}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
  });
  const offers = await offerRes.json();
  const offer = offers[0];
  if (!offer || offer.status !== 'active' || offer.qty_available < 1) {
    return res.status(400).json({ error: 'sold_out' });
  }

  // 2) 予約作成（受取コード発行）
  const pickup_code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const createRes = await fetch(`${SB_URL}/rest/v1/reservations`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ offer_id, user_liff_id, qty: 1, status: 'reserved', pickup_code })
  });
  const created = await createRes.json();

  // 3) 在庫を1減らす
  await fetch(`${SB_URL}/rest/v1/offers?id=eq.${offer_id}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify({ qty_available: offer.qty_available - 1 })
  });

  return res.status(200).json({ ok: true, reservation: { id: created[0].id, pickup_code } });
}
