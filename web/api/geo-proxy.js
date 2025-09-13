// api/geo-proxy.js
// Vercel Serverless (Node.js). Nominatim を同一オリジン経由で呼ぶ軽量プロキシ。
// 429 を避けるためにキャッシュ＆単発呼び出し前提。必要ならメモリレート制限も追加可。

const UA =
  process.env.GEO_CONTACT ||
  "line-food-web demo (contact: replace-with-your-email@example.com)";

module.exports = async (req, res) => {
  try {
    const { q = "", limit = "8", country = "jp" } = req.query || {};
    const qq = String(q).trim();
    if (!qq) {
      res.status(200).json([]);
      return;
    }

    const params = new URLSearchParams({
      format: "jsonv2",
      addressdetails: "1",
      namedetails: "1",
      limit: String(Math.min(20, Number(limit) || 8)),
      countrycodes: String(country || "jp"),
      "accept-language": "ja",
      q: qq,
    });

    const url = `https://nominatim.openstreetmap.org/search?${params}`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,              // Nominatim 利用規約に沿って UA を明示
        Referer: req.headers.host || "", // おまけ
        Accept: "application/json",
      },
    });

    // 失敗時も JSON で空配列を返す（フロントは静かにフォールバック）
    if (!r.ok) {
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json([]);
      return;
    }

    const data = await r.json();

    // 軽い CDN キャッシュ（1日）＋ SWR（7日）
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    // 同一オリジンで呼ぶ想定だが、念のため CORS を緩める
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.status(200).json(Array.isArray(data) ? data : []);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json([]);
  }
};
