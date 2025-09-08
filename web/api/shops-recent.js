// web/api/shops-recent.js
import { sbFetch } from "./_lib/sb.js";

// offers から表示用に 1〜2件抽出（在庫 > priority > 価格）
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
    price_min: Number.isFinite(+o.price) ? +o.price : null,
    slot: o.slot_label ?? null,
  }));
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, "http://x");
    const limit = Math.min(
      Math.max(Number(u.searchParams.get("limit")) || 6, 1),
      24
    );
    const category = u.searchParams.get("category") || null;
    const priceMax = u.searchParams.get("priceMax")
      ? Number(u.searchParams.get("priceMax"))
      : null;

    // ▼ shops 取得（既存どおり）
    const qs = new URLSearchParams();
    qs.set("select", "id,name,address,photo_url,min_price,category,created_at");
    if (category) qs.append("category", `eq.${category}`);
    if (Number.isFinite(priceMax)) qs.append("min_price", `lte.${priceMax}`);
    qs.set("order", "created_at.desc");
    qs.set("limit", String(limit));

    const r = await sbFetch(`/rest/v1/shops?${qs.toString()}`, { method: "GET" });
    if (!r.ok) throw new Error(`SB shops fetch failed: ${r.status}`);
    const rows = await r.json();

    // 何もなければ即返す
    if (!rows.length) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ ok: true, items: [] }));
      return;
    }

    // ▼ 対象 shop_id 群
    const ids = rows.map((s) => s.id);
    const inExpr = `in.(${ids
      .map((id) => `"${String(id).replace(/"/g, '\\"')}"`)
      .join(",")})`;

    // ▼ offers をまとめて取得（1回のREST呼び出し）
    const p = new URLSearchParams();
    p.set(
      "select",
      "shop_id,title,thumb_url,price,qty_available,slot_label,priority"
    );
    p.set("shop_id", inExpr);
    // 並びはクライアント側で行うので order は不要

    const rOffers = await sbFetch(`/rest/v1/offers?${p.toString()}`, {
      method: "GET",
    });
    if (!rOffers.ok) throw new Error(`SB offers fetch failed: ${rOffers.status}`);
    const offers = await rOffers.json();

    // ▼ shop ごとにグルーピング＆集計
    const byShop = new Map(ids.map((id) => [id, []]));
    for (const o of offers) {
      const k = String(o.shop_id);
      if (byShop.has(k)) byShop.get(k).push(o);
    }

    const items = rows.map((s) => {
      const list = byShop.get(String(s.id)) ?? [];
      const stock_remain = list.reduce(
        (acc, o) => acc + (Number(o.qty_available) > 0 ? Number(o.qty_available) : 0),
        0
      );
      const bundles = pickBundles(list);
      const minFromOffers = list
        .map((o) => +o.price)
        .filter(Number.isFinite)
        .sort((a, b) => a - b)[0];

      return {
        id: s.id,
        name: s.name || "",
        address: s.address || "",
        photo_url: s.photo_url || "",
        category: s.category || "",
        created_at: s.created_at || null,
        // offers 由来で上書き（無ければ元のまま）
        min_price: Number.isFinite(minFromOffers) ? minFromOffers : s.min_price ?? null,
        stock_remain,
        bundles, // ★ これをフロントが描画
      };
    });

    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ ok: true, items }));
  } catch (e) {
    console.error("[shops-recent] error", e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "internal_error" }));
  }
}
