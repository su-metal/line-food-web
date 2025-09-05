// web/api/favorites.js (ESM / Node runtime)
import { getUserId } from './_lib/auth.js';
import { sbFetch } from './_lib/sb.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('allow', 'GET');
      res.end('Method Not Allowed');
      return;
    }

    const uid = getUserId(req);
    if (!uid) {
      res.statusCode = 401;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
      return;
    }

    const url = new URL(req.url, 'http://x'); // ベースはダミー
    const shopId = url.searchParams.get('shopId');

    if (shopId) {
      // === 単一店がお気に入りかどうか ===
      const q = `/rest/v1/favorites?select=shop_id&user_id=eq.${encodeURIComponent(uid)}&shop_id=eq.${encodeURIComponent(shopId)}&limit=1`;
      const r = await sbFetch(q, { method: 'GET' });
      if (!r.ok) throw new Error(`SB favorites check failed: ${r.status}`);
      const rows = await r.json();
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: true, isFav: Array.isArray(rows) && rows.length > 0 }));
      return;
    }

    // === 一覧 ===
    // 1) fav rows
    const r1 = await sbFetch(
      `/rest/v1/favorites?select=shop_id,created_at&user_id=eq.${encodeURIComponent(uid)}&order=created_at.desc`,
      { method: 'GET' }
    );
    if (!r1.ok) throw new Error(`SB favorites list failed: ${r1.status}`);
    const favs = await r1.json(); // [{shop_id, created_at}, ...]
    const ids = [...new Set(favs.map((f) => f.shop_id))];
    let shops = [];
    if (ids.length) {
      // 2) shops をまとめて取得
      // id=in.(1,2,3) を安全に組み立て（数値/文字列どちらでもOK）
      const inExpr = `in.(${ids
        .map((id) => (Number.isFinite(+id) ? String(+id) : `"${String(id).replace(/"/g, '\\"')}"`))
        .join(',')})`;

      const params = new URLSearchParams();
      params.set('select', 'id,name,address,photo_url');
      params.set('id', inExpr);

      const r2 = await sbFetch(`/rest/v1/shops?${params.toString()}`, { method: 'GET' });
      if (!r2.ok) throw new Error(`SB shops fetch failed: ${r2.status}`);
      shops = await r2.json(); // [{id,name,address,photo_url},...]
    }

    // 3) join 結果を返す（前端で使いやすい形）
    const map = new Map(shops.map((s) => [String(s.id), s]));
    const items = favs.map((f) => {
      const s = map.get(String(f.shop_id)) || {};
      return {
        shop_id: f.shop_id,
        created_at: f.created_at,
        id: s.id ?? f.shop_id,
        name: s.name ?? '',
        address: s.address ?? '',
        photo_url: s.photo_url ?? '',
      };
    });

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: true, items }));
  } catch (e) {
    console.error('[favorites] error', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
}
