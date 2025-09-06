// web/api/favorites.js
import { getUserId } from './_lib/auth.js';
import { sbFetch, noStore } from './_lib/sb.js';

export default async function handler(req, res) {
  try {
    const uid = await getUserId(req).then(r => r.userId ?? r); // 旧/新両対応
    if (!uid) {
      res.statusCode = 401; noStore(res);
      res.setHeader('content-type','application/json; charset=utf-8');
      res.end(JSON.stringify({ ok:false, error:'unauthorized' })); return;
    }

    const url = new URL(req.url, 'http://x');
    if (req.method === 'DELETE') {
      const shopId = url.searchParams.get('shopId');
      if (!shopId) { res.statusCode = 400; noStore(res);
        return res.end(JSON.stringify({ ok:false, error:'shopId required'})); }
      const r = await sbFetch(`/rest/v1/favorites?user_id=eq.${encodeURIComponent(uid)}&shop_id=eq.${encodeURIComponent(shopId)}`, { method:'DELETE' });
      if (!r.ok && r.status !== 204) throw new Error(`SB delete failed: ${r.status}`);
      res.statusCode = 204; noStore(res); res.end(); return;
    }

    if (req.method !== 'GET') {
      res.statusCode = 405; res.setHeader('allow','GET, DELETE'); return res.end('Method Not Allowed');
    }

    const shopId = new URL(req.url, 'http://x').searchParams.get('shopId');
    if (shopId) {
      // 単一店舗の isFav 確認
      const q = `/rest/v1/favorites?select=shop_id&user_id=eq.${encodeURIComponent(uid)}&shop_id=eq.${encodeURIComponent(shopId)}&limit=1`;
      const r = await sbFetch(q, { method:'GET' });
      const rows = r.ok ? await r.json() : [];
      res.statusCode = 200; noStore(res);
      res.setHeader('content-type','application/json; charset=utf-8');
      res.end(JSON.stringify({ ok:true, isFav: Array.isArray(rows) && rows.length>0 })); return;
    }

    // 一覧（favorites → shops をまとめて取得）
    const r1 = await sbFetch(`/rest/v1/favorites?select=shop_id,created_at&user_id=eq.${encodeURIComponent(uid)}&order=created_at.desc`, { method:'GET' });
    if (!r1.ok) throw new Error(`SB favorites list failed: ${r1.status}`);
    const favs = await r1.json();
    const ids = [...new Set(favs.map(f => String(f.shop_id)))];
    let shops = [];
    if (ids.length) {
      const inExpr = `in.(${ids.map(id => `"${id.replace(/"/g,'\\"')}"`).join(',')})`;
      const params = new URLSearchParams({ select:'id,name,address,photo_url', id: inExpr });
      const r2 = await sbFetch(`/rest/v1/shops?${params.toString()}`, { method:'GET' });
      if (!r2.ok) throw new Error(`SB shops fetch failed: ${r2.status}`);
      shops = await r2.json();
    }
    const map = new Map(shops.map(s => [String(s.id), s]));
    const items = favs.map(f => {
      const s = map.get(String(f.shop_id)) || {};
      return { shop_id: f.shop_id, created_at: f.created_at, id: s.id ?? f.shop_id, name: s.name ?? '', address: s.address ?? '', photo_url: s.photo_url ?? '' };
    });

    res.statusCode = 200; noStore(res);
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:true, items }));
  } catch (e) {
    console.error('[favorites] error', e);
    res.statusCode = 500; noStore(res);
    res.setHeader('content-type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:false, error:'internal_error' }));
  }
}
