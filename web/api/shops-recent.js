// web/api/shops-recent.js
import { sbFetch } from "./_lib/sb.js";

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

    const qs = new URLSearchParams();
    qs.set("select", "id,name,address,photo_url,min_price,category,created_at");
    if (category) qs.append("category", `eq.${category}`);
    if (Number.isFinite(priceMax)) qs.append("min_price", `lte.${priceMax}`);
    qs.set("order", "created_at.desc"); // nulls last はPostgREST 10系以降は無視されがちなので省略
    qs.set("limit", String(limit));

    const r = await sbFetch(`/rest/v1/shops?${qs.toString()}`, {
      method: "GET",
    });
    if (!r.ok) throw new Error(`SB shops fetch failed: ${r.status}`);
    const rows = await r.json();

    // --- 在庫集計（qty_available をショップ単位で合計）---
    let stockMap = new Map();
    if (rows.length) {
      const ids = rows.map((s) => s.id);
      const inExpr = `in.(${ids
        .map((id) => `"${String(id).replace(/"/g, '\\"')}"`)
        .join(",")})`;

      const p = new URLSearchParams();
      p.set("select", "shop_id,qty_available");
      p.set("shop_id", inExpr);
      p.append("qty_available", "gt.0");

      const r2 = await sbFetch(`/rest/v1/offers?${p.toString()}`, {
        method: "GET",
      });
      if (r2.ok) {
        const offers = await r2.json();
        for (const o of offers) {
          const k = String(o.shop_id);
          stockMap.set(
            k,
            (stockMap.get(k) || 0) + (Number(o.qty_available) || 0)
          );
        }
      }
    }

    const items = rows.map((s) => ({
      id: s.id,
      name: s.name || "",
      address: s.address || "",
      photo_url: s.photo_url || "",
      category: s.category || "",
      min_price: s.min_price ?? null,
      created_at: s.created_at || null,
      stock_remain: stockMap.get(String(s.id)) ?? 0,
    }));

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
