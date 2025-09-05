// api/reserve.js
import { createClient } from '@supabase/supabase-js';

// ─ ENV ─
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(s => s.trim());

const LINE_LOGIN_CHANNEL_ID = process.env.LINE_LOGIN_CHANNEL_ID; // ← 追加（LIFFの親チャネル）
const LINE_MSG_CHANNEL_ID   = process.env.LINE_CHANNEL_ID;       // ← 既存（Messaging API）

// ─ CORS ─
function applyCors(req, res) {
  const origin = req.headers.origin;
  const ok = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : (ALLOWED_ORIGINS[0] || '*'));
}

// ─ Auth: IDトークン検証（LINE Login → Messaging の順で試す）─
async function getUserIdFromIdToken(req) {
  const auth = req.headers.authorization || '';
  const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!idToken) throw new Error('no_id_token');

  async function verifyWith(clientId) {
    if (!clientId) return null;
    const resp = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: clientId })
    });
    const v = await resp.json().catch(() => null);
    return (resp.ok && v && v.sub) ? v : null;
  }

  // 1st: LIFFの親（LINE Login）で検証
  let v = await verifyWith(LINE_LOGIN_CHANNEL_ID);
  // 2nd: 念のため Messaging API でも試す
  if (!v) v = await verifyWith(LINE_MSG_CHANNEL_ID);

  if (!v) throw new Error('verify_failed');
  return v.sub; // "U..." のユーザーID
}

// ─ Handler ─
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST')   return res.status(405).json({ ok:false, error:'method_not_allowed' });

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ ok:false, error:'env_missing' });
  }

  try {
    const { offer_id } = req.body || {};
    const offerIdStr = String(offer_id || '').trim();
    if (!offerIdStr) return res.status(400).json({ ok:false, error:'bad_request' });

    // IDトークン → ユーザーID確定
    const user_liff_id = await getUserIdFromIdToken(req);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // 在庫引当＋予約作成は DB の RPC で原子的に実行
    const { data, error } = await supabase
      .rpc('reserve_offer', { p_offer_id: offerIdStr, p_user_id: user_liff_id });

    if (error) {
      console.error(error);
      return res.status(500).json({ ok:false, error:'internal_error', detail: error.message });
    }

    // data は { ok: true/false, error?: 'already_reserved'|'sold_out_or_missing', reservation?: {...} }
    return res.status(data?.ok ? 200 : 400).json(data);

  } catch (e) {
    // 認証失敗など
    console.error(e);
    return res.status(401).json({ ok:false, error:'auth_or_internal_error', detail: e.message });
  }
}
