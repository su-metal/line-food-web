// api/reserve.js
import { createClient } from '@supabase/supabase-js';

// ── Env ───────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY; // 互換

// CORS: 許可オリジン（カンマ区切り）。未設定なら本番フロントだけ許可
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://line-food-web.vercel.app')
  .split(',')
  .map(s => s.trim());

// ── CORS Helper ───────────────────────────────────────────────────────
function applyCors(req, res) {
  const origin = req.headers.origin;
  const ok = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : ALLOWED_ORIGINS[0]);
}

// ── Handler（トップレベルで1回だけ export） ───────────────────────────
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Env 未設定ならここで終了（export を if の中に置かない）
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({
      ok: false,
      error: 'env_missing',
      detail: {
        has_SUPABASE_URL: !!SUPABASE_URL,
        has_SUPABASE_SERVICE_ROLE: !!SERVICE_ROLE
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

  try {
    const { offer_id, user_liff_id } = req.body || {};
    if (!offer_id || !user_liff_id) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    // 1) 対象オファー取得
    const { data: offers, error: getErr } = await supabase
      .from('offers')
      .select('id, qty_available, pickup_start, pickup_end, shops:shop_id(id, name, address)')
      .eq('id', offer_id)
      .limit(1);

    if (getErr) throw getErr;
    const offer = offers?.[0];
    if (!offer) return res.status(404).json({ ok: false, error: 'offer_not_found' });

    // 2) 在庫を同時更新に強く1減らす（qty_available > 0 の時のみ）
    const { data: updated, error: updErr } = await supabase
      .from('offers')
      .update({ qty_available: offer.qty_available - 1 })
      .eq('id', offer_id)
      .gt('qty_available', 0)
      .select('id, qty_available')
      .single();

    if (updErr) throw updErr;
    if (!updated) return res.status(409).json({ ok: false, error: 'sold_out' });

    // 3) 予約作成
    const pickup_code = Math.random().toString().slice(2, 8);
    const { data: reservation, error: insErr } = await supabase
      .from('reservations')
      .insert({
        offer_id,
        user_liff_id,
        pickup_code,
        status: 'reserved'
      })
      .select()
      .single();

    if (insErr) throw insErr;

    return res.status(200).json({
      ok: true,
      reservation: {
        id: reservation.id,
        pickup_code,
        shop_name: offer.shops?.name || '',
        pickup_start: offer.pickup_start,
        pickup_end: offer.pickup_end
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'internal_error', detail: e.message });
  }
}
