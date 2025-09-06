// web/api/favorites-remove.js (ESM)
import { getUserId } from "./_lib/auth.js";
import { sbFetch } from "./_lib/sb.js";

async function readJson(req) {
  return await new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(
          chunks.length
            ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
            : {}
        );
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  try {
    const method = req.method || "POST";
    if (!["POST", "DELETE"].includes(method)) {
      res.statusCode = 405;
      res.setHeader("allow", "POST, DELETE");
      res.end("Method Not Allowed");
      return;
    }

    const uid = getUserId(req);
    if (!uid) {
      res.statusCode = 401;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "unauthorized" }));
      return;
    }

    // shopId は POST→body、DELETE→query から取得
    let shopId = null;
    if (method === "POST") {
      const body = await readJson(req);
      shopId = body?.shopId ?? null;
    } else {
      const url = new URL(req.url, "http://x");
      shopId = url.searchParams.get("shopId");
    }

    if (!shopId) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, error: "shopId required" }));
      return;
    }

    // Supabase: 該当のお気に入りを削除
    const delUrl = `/rest/v1/favorites?user_id=eq.${encodeURIComponent(
      uid
    )}&shop_id=eq.${encodeURIComponent(shopId)}`;
    const r = await sbFetch(delUrl, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }, // 204を期待
    });

    if (!(r.status === 204 || r.status === 200)) {
      throw new Error(`SB favorites delete failed: ${r.status}`);
    }

    // No Content
    res.statusCode = 204;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.end();
  } catch (e) {
    console.error("[favorites-remove] error", e);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: false, error: "internal_error" }));
  }
}
