// web/api/_lib/bundles.js
import { sbFetch } from "./sb.js";

// 表示用に offers から 1〜2件を抽出（在庫 > 優先度 > 価格）
function pickBundles(list = []) {
  const sorted = [...list].sort((a, b) => {
    const av = Number(a.qty_available) > 0 ? 0 : 1;
    const bv = Number(b.qty_available) > 0 ? 0 : 1;
    if (av !== bv) return av - bv;
    const ap = Number.isFinite(+a.priority) ? +a.priority : 999;
    const bp = Number.isFinite(+b.priority) ? +b.priority : 999;
    if (ap !== bp) return ap - bp;
    return (+a.price || 0) - (+b.price || 0);
  });
  return sorted.slice(0, 2).map((o) => ({
    title: o.title ?? "おすすめ",
    thumb_url: o.thumb_url ?? null,
    price_min: Number.isFinite(+o.price) ? +o.price : null, // ← 商品価格
    qty_available: Number.isFinite(+o.qty_available) ? +o.qty_available : 0, // ← 商品の残数
    slot: o.slot_label ?? null,
  }));
}

/**
 * shops: [{ id, name, ... }]
 *   -> [{ ..., stock_remain, min_price(offersで上書き), bundles:[...] }]
 */
export async function attachBundles(shops = []) {
  if (!Array.isArray(shops) || shops.length === 0) return shops ?? [];
  const ids = [...new Set(shops.map((s) => s.id).filter(Boolean))];
  if (!ids.length) return shops;

  const select =
    "shop_id,title,thumb_url,price,qty_available,slot_label,priority";
  // select はURLエンコード。in.(...) はそのまま並べます（idsはuuid想定）
  const qs = `select=${encodeURIComponent(select)}&shop_id=in.(${ids.join(
    ","
  )})`;

  const r = await sbFetch(`/rest/v1/offers?${qs}`, { method: "GET" });
  const txt = await r.text();
  let rows = [];
  try {
    rows = JSON.parse(txt);
  } catch {
    rows = [];
  }

  const byShop = new Map(ids.map((id) => [id, []]));
  for (const o of rows)
    if (byShop.has(o.shop_id)) byShop.get(o.shop_id).push(o);

  return shops.map((s) => {
    const list = byShop.get(s.id) ?? [];
    const stock_remain = list.reduce(
      (acc, o) => acc + (Number(o.qty_available) || 0),
      0
    );
    const bundles = pickBundles(list);
    const minFromOffers = list
      .map((o) => +o.price)
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];

    return {
      ...s,
      stock_remain: Number.isFinite(stock_remain)
        ? stock_remain
        : s.stock_remain ?? null,
      min_price: Number.isFinite(minFromOffers) ? minFromOffers : s.min_price,
      bundles,
    };
  });
}
