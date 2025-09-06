import { sbFetch } from './_lib/sb.js';

export default async function handler(req, res) {
  try {
    const base = process.env.SUPABASE_URL || '';
    const key  = process.env.SUPABASE_SERVICE_KEY || '';
    const env  = {
      supabase_url_present: !!base,
      supabase_service_key_present: !!key,
      supabase_host: base ? new URL(base).host : null
    };

    let status=null, body=null;
    try {
      const r = await sbFetch('/rest/v1/favorites?select=shop_id&limit=1', { method:'GET' });
      status = r.status;
      const txt = await r.text();
      try { body = JSON.parse(txt); } catch { body = txt; }
    } catch (e) {
      body = String(e && e.message || e);
    }

    res.statusCode = 200;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:true, env, status, body }));
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:false, error:String(e && e.message || e) }));
  }
}
