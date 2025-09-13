// web/api/geo-proxy.js
// Nominatim proxy: station/landmark only, caching, IP rate-limit, graceful fallback (no 500).

const CONTACT_EMAIL = process.env.NOMINATIM_EMAIL || "contact@example.com"; // ← Vercel 環境変数で設定推奨
const UA = `line-food-web/0.1 (+mailto:${CONTACT_EMAIL})`;
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// in-memory cache (best-effort)
const CACHE = new Map(); // key -> { ts, data }
const TTL_MS = 6 * 60 * 60 * 1000;

// simple token-bucket per IP
const BUCKET = new Map(); // ip -> { tokens, updated }
const REFILL_PER_SEC = 2;
const BURST = 6;

function allow(ip) {
  const now = Date.now();
  let b = BUCKET.get(ip);
  if (!b) { b = { tokens: BURST, updated: now }; BUCKET.set(ip, b); }
  const elapsed = (now - b.updated) / 1000;
  b.tokens = Math.min(BURST, b.tokens + elapsed * REFILL_PER_SEC);
  b.updated = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function send(res, status, obj, cacheable = false) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (cacheable && status === 200) {
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.end(JSON.stringify(obj));
}
const ok = (res, data, cacheable = true) => send(res, 200, data, cacheable);
const tooMany = (res) => send(res, 429, { items: [], error: "rate_limited" });
const bad = (res, msg) => send(res, 400, { items: [], error: msg || "bad_request" });

const LOCAL_FALLBACK = [
  { name: "東京駅", lat: 35.681236, lng: 139.767125, sub: "千代田区", icon: "🚉" },
  { name: "新宿駅", lat: 35.690921, lng: 139.700257, sub: "新宿区", icon: "🚉" },
  { name: "渋谷駅", lat: 35.658034, lng: 139.701636, sub: "渋谷区", icon: "🚉" },
  { name: "横浜駅", lat: 35.46583,  lng: 139.622,    sub: "西区",   icon: "🚉" },
  { name: "名古屋駅", lat: 35.170694, lng: 136.881637, sub: "中村区", icon: "🚉" },
  { name: "大阪駅", lat: 34.702485, lng: 135.495951, sub: "北区",   icon: "🚉" },
  { name: "京都駅", lat: 34.985849, lng: 135.758766, sub: "下京区", icon: "🚉" },
  { name: "札幌駅", lat: 43.06866,  lng: 141.35076,  sub: "北区",   icon: "🚉" },
  { name: "福岡空港", lat: 33.5931,  lng: 130.451,    sub: "福岡",   icon: "✈️" },
];

// keep: station/landmark only
function keep(it) {
  const cls = it.class, typ = it.type;
  if (cls === "railway" && (typ === "station" || typ === "halt")) return true;
  if (cls === "aeroway" && (typ === "aerodrome" || typ === "terminal")) return true;
  if (cls === "tourism" && ["attraction","museum","zoo","theme_park","viewpoint","aquarium"].includes(typ)) return true;
  if (cls === "leisure" && ["park","stadium"].includes(typ)) return true;
  if (cls === "historic" && ["castle","ruins","monument","memorial"].includes(typ)) return true;
  if (cls === "natural" && ["peak"].includes(typ)) return true;
  if (cls === "place" && ["city","town","village","suburb","neighbourhood","quarter"].includes(typ)) return true;
  if (cls === "amenity" && ["university","college","hospital","library"].includes(typ)) return true;
  return false;
}
function iconOf(it) {
  const cls = it.class;
  if (cls === "railway") return "🚉";
  if (cls === "aeroway") return "✈️";
  if (cls === "tourism") return "📍";
  if (cls === "leisure") return "🌳";
  if (cls === "historic") return "🏰";
  if (cls === "natural") return "⛰️";
  if (cls === "amenity") return "🏢";
  if (cls === "place") return "🗺️";
  return "📍";
}

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (hit && (Date.now() - hit.ts) < TTL_MS) return hit.data;
  return null;
}
function cacheSet(key, data) {
  CACHE.set(key, { ts: Date.now(), data });
}

async function callNominatim(params) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "ja");
  url.searchParams.set("email", CONTACT_EMAIL);     // ★ 連絡先を常時付与
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let resp;
  try {
    resp = await fetch(url, {
      headers: { "Accept": "application/json", "User-Agent": UA },
    });
  } catch (e) {
    return { status: 0, data: [], error: String(e?.message || e) };
  }

  const status = resp.status;
  if (status !== 200) {
    // 429/403/4xx/5xx すべて呼び出し側でフォールバック処理
    return { status, data: [] };
  }
  let json = [];
  try { json = await resp.json(); } catch { json = []; }
  return { status, data: Array.isArray(json) ? json : [] };
}

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, "http://x");
    const op = u.searchParams.get("op") || "suggest"; // 'suggest' | 'search'
    const qRaw = (u.searchParams.get("q") || "").trim();
    const limit = Math.min(Number(u.searchParams.get("limit") || "8"), 15);
    const countrycodes = u.searchParams.get("countrycodes") || "jp";
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "0.0.0.0";

    if (!allow(ip)) return tooMany(res);
    if (!qRaw) return ok(res, { items: [] });
    if (op === "suggest" && qRaw.length < 2) return ok(res, { items: [] }); // 1文字は抑制

    const key = `${op}:${countrycodes}:${qRaw.toLowerCase()}:${limit}`;
    const cached = cacheGet(key);
    if (cached) return ok(res, cached);

    const { status, data } = await callNominatim({ q: qRaw, limit, countrycodes, namedetails: 1 });

    // 上流エラー/拒否は必ず 200 + フォールバックで返す（フロントに 500 を出さない）
    if (status !== 200) {
      if (op === "suggest") {
        const list = LOCAL_FALLBACK.filter(x => x.name.includes(qRaw)).slice(0, limit);
        const ret = { items: list };
        cacheSet(key, ret);
        return ok(res, ret);
      } else {
        const first = LOCAL_FALLBACK.find(x => x.name.includes(qRaw)) || null;
        return ok(res, { hit: first });
      }
    }

    const filtered = data.filter(keep);

    if (op === "suggest") {
      const items = filtered.slice(0, limit).map(it => {
        const lat = Number(it.lat), lng = Number(it.lon);
        const name = it.namedetails?.name || it.name || it.address?.station || (it.display_name?.split(",")[0] || "");
        const sub =
          it.address?.suburb || it.address?.neighbourhood || it.address?.city ||
          it.address?.town || it.address?.village || it.address?.state || "";
      return { name, sub, lat, lng, icon: iconOf(it) };
      });
      const ret = { items };
      cacheSet(key, ret);
      return ok(res, ret, true);
    } else {
      const first = filtered[0];
      if (!first) return ok(res, { hit: null });
      const lat = Number(first.lat), lng = Number(first.lon);
      const name = first.namedetails?.name || first.name || first.address?.station || (first.display_name?.split(",")[0] || "");
      const sub =
        first.address?.suburb || first.address?.neighbourhood || first.address?.city ||
        first.address?.town || first.address?.village || first.address?.state || "";
      const hit = { name, sub, lat, lng, icon: iconOf(first) };
      const ret = { hit };
      cacheSet(key, ret);
      return ok(res, ret, true);
    }
  } catch (e) {
    console.error("[geo-proxy] fatal:", e);
    // ここでも 200 + フォールバックにする
    const u = new URL(req.url, "http://x");
    const op = u.searchParams.get("op") || "suggest";
    const qRaw = (u.searchParams.get("q") || "").trim();
    if (op === "suggest") {
      return ok(res, { items: LOCAL_FALLBACK.filter(x => x.name.includes(qRaw)).slice(0, 8) });
    } else {
      const first = LOCAL_FALLBACK.find(x => x.name.includes(qRaw)) || null;
      return ok(res, { hit: first });
    }
  }
};
