// web/api/sb-diag.js
import { sbFetch } from './_lib/sb.js';

export default async function handler(req, res) {
  try {
    const base    = process.env.SUPABASE_URL || '';
    const anonKey = process.env.SUPABASE_ANON_KEY || '';
    const srvKey  = process.env.SUPABASE_SERVICE_KEY || ''; // 移行確認用（将来は削除OK）

    const env = {
      supabase_url_present: !!base,
      supabase_anon_key_present: !!anonKey,
      supabase_service_key_present: !!srvKey, // 後で false になる想定
      supabase_host: base ? new URL(base).host : null
    };

    let status = null, body = null;
    try {
      // RLSのread確認：favoritesから1件だけ読む
      const r = await sbFetch('/rest/v1/favorites?select=shop_id&limit=1', { method:'GET' });
      status = r.status;
      const txt = await r.text();
      try { body = JSON.parse(txt); } catch { body = txt; }
    } catch (e) {
      body = String(e?.message || e);
    }

    res.statusCode = 200;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:true, env, status, body }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:false, error:String(e?.message || e) }));
  }
}
