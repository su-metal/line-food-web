// web/api/nearby.js
import { sbFetch } from "./_lib/sb.js";
import { attachBundles } from "./_lib/bundles.js";

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, "http://x");
    const lat = Number(u.searchParams.get("lat"));
    const lng = Number(u.searchParams.get("lng"));
    const radius = Math.max(Number(u.searchParams.get("radius")) || 3000, 100);
    const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 6, 1), 24);
    const category = u.searchParams.get("category") || null;
    const priceMax = u.searchParams.get("priceMax")
      ? Number(u.searchParams.get("priceMax"))
      : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "lat_lng_required" }));
      return;
    }

    // shops を取得
    const qs = new URLSearchParams();
    qs.set("select", "id,name,address,photo_url,min_price,category,lat,lng,created_at");
    if (category) qs.append("category", `eq.${category}`);
    if (Number.isFinite(priceMax)) qs.append("min_price", `lte.${priceMax}`);
    qs.set("limit", "200"); // 近傍検索の母集団
    const r = await sbFetch(`/rest/v1/shops?${qs.toString()}`, { method: "GET" });
    if (!r.ok) throw new Error(`SB shops fetch failed: ${r.status}`);
    const rows = await r.json();

    // 距離計算 → 半径フィルタ → 近い順 → limit
    const nearby = rows
      .map(s => ({ ...s, distance_m: haversine(lat, lng, +s.lat, +s.lng) }))
      .filter(s => Number.isFinite(s.distance_m) && s.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, limit);

    // ★ bundles を付与（各 bundle に price_min / qty_available）
    const items = await attachBundles(nearby, { maxBundles: 2 });

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
