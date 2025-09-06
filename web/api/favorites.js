// web/api/favorites.js (ESM / Node runtime)
import { getUserId } from './_lib/auth.js';
import { sbFetch } from './_lib/sb.js';

export default async function handler(req, res) {
  try {
    const method = req.method || 'GET';

    if (method === 'GET') {
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
        // 2) shops をまとめて取得 (in.(...))
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

      // 3) join 結果を返す
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
      return;
    }

    if (method === 'DELETE') {
      // === お気に入り解除（古いクライアント互換用） ===
      const uid = getUserId(req);
      if (!uid) {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        return;
      }

      const url = new URL(req.url, 'http://x');
      const shopId = url.searchParams.get('shopId');
      if (!shopId) {
        res.statusCode = 400;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ ok: false, error: 'missing_shopId' }));
        return;
      }

      // Supabase 上の favorites から該当行を削除
      const delUrl = `/rest/v1/favorites?user_id=eq.${encodeURIComponent(uid)}&shop_id=eq.${encodeURIComponent(shopId)}`;
      const r = await sbFetch(delUrl, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' }, // 204 を期待
      });

      if (!(r.status === 204 || r.status === 200)) {
        // 204 以外はエラー扱い（200 を返す環境設定の場合も許容）
        throw new Error(`SB favorites delete failed: ${r.status}`);
      }

      // 本エンドポイントは 204（No Content）で返す
      res.statusCode = 204;
      res.end();
      return;
    }

    res.statusCode = 405;
    res.setHeader('allow', 'GET, DELETE');
    res.end('Method Not Allowed');
  } catch (e) {
    console.error('[favorites] error', e);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'internal_error' }));
  }
}
