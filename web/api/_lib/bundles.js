// web/api/_lib/bundles.js
import { sbFetch } from './sb.js';

// 在庫あり優先 → priority 昇順 → 価格昇順
function pickBundles(list = [], max = 2) {
  const sorted = [...list].sort((a, b) => {
    const av = Number(a.qty_available) > 0 ? 0 : 1;
    const bv = Number(b.qty_available) > 0 ? 0 : 1;
    if (av !== bv) return av - bv;
    const ap = Number.isFinite(+a.priority) ? +a.priority : 999;
    const bp = Number.isFinite(+b.priority) ? +b.priority : 999;
    if (ap !== bp) return ap - bp;
    return (+a.price || 0) - (+b.price || 0);
  });
  return sorted.slice(0, max).map(o => ({
    title: o.title ?? 'おすすめ',
    thumb_url: o.thumb_url ?? null,
    price_min: Number.isFinite(+o.price) ? +o.price : null,               // 商品価格
    qty_available: Number.isFinite(+o.qty_available) ? +o.qty_available : 0, // 商品残数
    slot: o.slot_label ?? null,
  }));
}

export async function attachBundles(shops = [], { maxBundles = 2 } = {}) {
  if (!Array.isArray(shops) || shops.length === 0) return shops ?? [];
  const ids = [...new Set(shops.map(s => s.id).filter(Boolean))];
  if (!ids.length) return shops;

  // 必要カラムを必ず取得
  const select = 'shop_id,title,thumb_url,price,qty_available,slot_label,priority';
  const inExpr = `in.(${ids.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',')})`;

  const qs = new URLSearchParams();
  qs.set('select', select);
  qs.set('shop_id', inExpr);

  const r = await sbFetch(`/rest/v1/offers?${qs.toString()}`, { method: 'GET' });
  const rows = (await r.json().catch(() => [])) || [];

  const byShop = new Map(ids.map(id => [String(id), []]));
  for (const o of rows) {
    const k = String(o.shop_id);
    if (byShop.has(k)) byShop.get(k).push(o);
  }

  return shops.map(s => {
    const list = byShop.get(String(s.id)) ?? [];
    const stock_remain = list.reduce((acc, o) => acc + (Number(o.qty_available) || 0), 0);
    const bundles = pickBundles(list, maxBundles);
    const minFromOffers = list.map(o => +o.price).filter(Number.isFinite).sort((a,b)=>a-b)[0];

    return {
      ...s,                                   // 既存フィールド（distance_m 等）維持
      stock_remain,                           // 店舗合算（UIの他箇所で使う場合用）
      min_price: Number.isFinite(minFromOffers) ? minFromOffers : (s.min_price ?? null),
      bundles,                                // ★ 各 bundle に price_min / qty_available
    };
  });
}
