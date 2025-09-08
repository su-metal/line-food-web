// web/api/nearby.js
import { sbFetch } from "./_lib/sb.js";

// Haversine（m）
function distM(lat1, lng1, lat2, lng2) {
  const R = 6371000; // m
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

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
    const lat = Number(u.searchParams.get("lat"));
    const lng = Number(u.searchParams.get("lng"));
    const radius = Math.max(Number(u.searchParams.get("radius")) || 3000, 1);
    const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 6, 1), 24);
    const category = u.searchParams.get("category") || null;
    const priceMax = u.searchParams.get("priceMax")
      ? Number(u.searchParams.get("priceMax"))
      : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "bad_request: missing lat/lng" }));
      return;
    }

    // ▼ shopsを取得（lat/lngがNULLでないものに限定）
    const qs = new URLSearchParams();
    qs.set("select", "id,name,address,photo_url,min_price,category,created_at,lat,lng");
    qs.append("lat", "not.is.null");
    qs.append("lng", "not.is.null");
    if (category) qs.append("category", `eq.${category}`);
    if (Number.isFinite(priceMax)) qs.append("min_price", `lte.${priceMax}`);
    // 件数が多い場合は適宜調整（今は小規模想定）
    qs.set("limit", "500");

    const r = await sbFetch(`/rest/v1/shops?${qs.toString()}`, { method: "GET" });
    if (!r.ok) throw new Error(`SB shops fetch failed: ${r.status}`);
    const rows = await r.json();

    // ▼ 距離計算 → 半径内に絞り込み → 近い順にソート → 上限数まで
    const nearby = rows
      .map((s) => {
        const d = Number.isFinite(+s.lat) && Number.isFinite(+s.lng)
          ? distM(lat, lng, +s.lat, +s.lng)
          : Infinity;
        return { ...s, distance_m: d };
      })
      .filter((s) => s.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, limit);

    if (!nearby.length) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ ok: true, items: [] }));
      return;
    }

    // ▼ offers をまとめて取得（1回のREST呼び出し）
    const ids = nearby.map((s) => s.id);
    const inExpr = `in.(${ids
      .map((id) => `"${String(id).replace(/"/g, '\\"')}"`)
      .join(",")})`;

    const p = new URLSearchParams();
    p.set(
      "select",
      "shop_id,title,thumb_url,price,qty_available,slot_label,priority"
    );
    p.set("shop_id", inExpr);

    const rOffers = await sbFetch(`/rest/v1/offers?${p.toString()}`, { method: "GET" });
    if (!rOffers.ok) throw new Error(`SB offers fetch failed: ${rOffers.status}`);
    const offers = await rOffers.json();

    // ▼ グルーピング＆集計
    const byShop = new Map(ids.map((id) => [id, []]));
    for (const o of offers) {
      const k = String(o.shop_id);
      if (byShop.has(k)) byShop.get(k).push(o);
    }

    const items = nearby.map((s) => {
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
        distance_m: s.distance_m,
        // offers 由来で上書き（無ければ元のまま）
        min_price: Number.isFinite(minFromOffers) ? minFromOffers : s.min_price ?? null,
        stock_remain,
        bundles, // ★ フロントで描画
      };
    });

    res.statusCode = 200;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ ok: true, items }));
  } catch (e) {
    console.error("[nearby] error", e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "internal_error" }));
  }
}
