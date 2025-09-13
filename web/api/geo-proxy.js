// web/api/geo-proxy.js  （※Root Directory が web の場合）
// もしくは /api/geo-proxy.js （Root Directory がプロジェクト直下の場合）

export default async function handler(req, res) {
  try {
    const host = req.headers.host || "localhost";
    const urlObj = new URL(req.url, `https://${host}`);
    const sp = urlObj.searchParams;

    const op    = sp.get("op") || "suggest";
    const q     = (sp.get("q") || "").trim();
    const limit = Math.min(Number(sp.get("limit") || (op === "search" ? 1 : 8)), 15);
    const cc    = sp.get("countrycodes") || "jp";

    // 文字数が少なすぎるとノイズが多いので 1〜2 文字は早期終了（必要に応じて調整）
    if (!q || q.length < 1) {
      res.setHeader("Cache-Control", "no-store");
      return res.status(200).json([]);
    }

    // Nominatim へ
    const base = "https://nominatim.openstreetmap.org/search";
    const params = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      namedetails: "1",
      limit: String(limit),
      countrycodes: cc,
      "accept-language": "ja",
      q
    });
    const ua =
      process.env.NOMINATIM_UA ||
      "line-food-web/0.1 (+https://line-food-web.vercel.app)";

    const upstream = await fetch(`${base}?${params.toString()}`, {
      headers: {
        "User-Agent": ua,                       // ★ 必須
        "Referer": `https://${host}/`,
        "Accept": "application/json"
      },
      // 失敗時にすぐ再実行されないように都度取得
      cache: "no-store"
    });

    if (!upstream.ok) {
      // 上流のステータスをそのまま返してブラウザ側のフォールバックを活かす
      return res.status(upstream.status).json({ error: "upstream", status: upstream.status });
    }

    const arr = await upstream.json();

    // 駅・ランドマークだけに絞る
    const ALLOW = {
      railway: new Set(["station", "halt"]),
      tourism: null, // tourism は全部許可（観光名所）
      amenity: new Set([
        "university","library","park","museum","zoo","aquarium",
        "theatre","arts_centre","cinema","hospital","townhall",
        "public_building","shrine","temple"
      ]),
      place: new Set(["city","town","village","suburb","neighbourhood"])
    };

    const filtered = Array.isArray(arr)
      ? arr.filter(it => {
          const cls = it.class; const typ = it.type;
          if (!cls) return false;
          if (!(cls in ALLOW)) return false;
          const allow = ALLOW[cls];
          return allow === null || allow.has(typ);
        })
      : [];

    const out = op === "search" ? filtered.slice(0, 1) : filtered.slice(0, limit);

    // 軽くエッジキャッシュ
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
    return res.status(200).json(out);
  } catch (e) {
    console.error("geo-proxy error", e);
    return res.status(500).json({ error: "internal" });
  }
}
