// api/favorite-add.js
import { createClient } from '@supabase/supabase-js';

// ── Env ─────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE ||
  process.env.SUPABASE_SERVICE_KEY ||          // 互換名を許容
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://line-food-web.vercel.app')
  .split(',')
  .map(s => s.trim());

// ── CORS ────────────────────────────────────────────
function applyCors(req, res) {
  const origin = req.headers.origin;
  const ok = ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Origin', ok ? origin : ALLOWED_ORIGINS[0]);
}

// ── Handler ────────────────────────────────────────
export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'method_not_allowed' });

  if (!SUPABASE_URL || !SERVICE_ROLE) {
    return res.status(500).json({ ok:false, error:'env_missing' });
  }

  try {
    const { shop_id, user_liff_id } = req.body || {};
    const shopIdNum = Number(shop_id);
    if (!shopIdNum || !user_liff_id) {
      return res.status(400).json({ ok:false, error:'bad_request' });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // favorites: unique(user_liff_id, shop_id)
    const { data, error } = await supabase
      .from('favorites')
      .upsert(
        { user_liff_id, shop_id: shopIdNum },
        { onConflict: 'user_liff_id,shop_id', ignoreDuplicates: true }
      )
      .select()
      .maybeSingle();

    if (error) throw error;

    return res.status(200).json({ ok:true, favorite: data || { user_liff_id, shop_id: shopIdNum } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok:false, error:'internal_error', detail: e.message });
  }
}
