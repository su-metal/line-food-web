// web/api/shops-recent.js
import { sbFetch } from "./_lib/sb.js";
import { attachBundles } from "./_lib/bundles.js";

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, "http://x");
    const limit = Math.min(Math.max(Number(u.searchParams.get("limit")) || 6, 1), 24);
    const category = u.searchParams.get("category") || null;
    const priceMax = u.searchParams.get("priceMax")
      ? Number(u.searchParams.get("priceMax"))
      : null;

    const qs = new URLSearchParams();
    qs.set("select", "id,name,address,photo_url,min_price,category,created_at,lat,lng");
    if (category) qs.append("category", `eq.${category}`);
    if (Number.isFinite(priceMax)) qs.append("min_price", `lte.${priceMax}`);
    qs.set("order", "created_at.desc");
    qs.set("limit", String(limit));

    const r = await sbFetch(`/rest/v1/shops?${qs.toString()}`, { method: "GET" });
    if (!r.ok) throw new Error(`SB shops fetch failed: ${r.status}`);
    const rows = await r.json();

    // ★ bundles（price_min/qty_available 含む）を付与
    const items = await attachBundles(rows, { maxBundles: 2 });

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
