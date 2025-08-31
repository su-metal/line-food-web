// api/reserve.js
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;               // 例: https://abcdXXXX.supabase.co
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||         // ← 追加
  process.env.SUPABASE_SERVICE_ROLE_KEY;      // ← 予備名   // service_role key（サーバ専用！クライアントに出さない）
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID;          // 任意: IDトークン検証に使う

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

// 任意: LINE IDトークン検証（liff.getIDToken() を送ってくる場合）
// 使うならフロントから Authorization: Bearer <idToken> を付けてPOSTしてください
async function verifyLineIdToken(idToken) {
  if (!idToken) return null;
  try {
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: LINE_CHANNEL_ID }),
    });
    if (!res.ok) return null;
    return await res.json(); // {sub, name, ...}
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    const { offer_id, user_liff_id } = req.body || {};
    if (!offer_id || !user_liff_id) {
      return res.status(400).json({ ok: false, error: 'bad_request' });
    }

    // （任意）LINE IDトークン検証
    // const authz = req.headers.authorization?.split(' ')[1];
    // const verified = await verifyLineIdToken(authz);
    // if (!verified) return res.status(401).json({ ok:false, error:'invalid_id_token' });

    // 1) 対象オファー取得（店舗表示などに使う）
    const { data: offers, error: getErr } = await supabase
      .from('offers')
      .select('id, qty_available, pickup_start, pickup_end, shops:shop_id(id, name, address)')
      .eq('id', offer_id)
      .limit(1);

    if (getErr) throw getErr;
    const offer = offers?.[0];
    if (!offer) return res.status(404).json({ ok:false, error:'offer_not_found' });

    // 2) 在庫を「同時更新に強い」形で1減らす
    //    → qty_available > 0 のときだけ減る。更新できなければ在庫切れ。
    const { data: updated, error: updErr } = await supabase
      .from('offers')
      .update({ qty_available: offer.qty_available - 1 })
      .eq('id', offer_id)
      .gt('qty_available', 0)
      .select('id, qty_available')
      .single();

    if (updErr) throw updErr;
    if (!updated) {
      return res.status(409).json({ ok:false, error:'sold_out' });
    }

    // 3) 受取コードを発行（簡易：6桁）
    const pickup_code = Math.random().toString().slice(2, 8);

    // 4) 予約レコード作成
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

    // 5) 応答
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
    return res.status(500).json({ ok:false, error:'internal_error' });
  }
}
