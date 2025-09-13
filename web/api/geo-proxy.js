// web/api/geo-proxy.js
// Lightweight Nominatim proxy with caching, filtering (station/landmark only),
// per-IP rate limiting, and graceful 429 fallback.

const UA = 'line-food-web/0.1 (contact: you@example.com)'; // ←連絡先に変更推奨
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// --- in-memory cache (best-effort; survives per-lambda warm) ---
const CACHE = new Map(); // key -> { ts, data }
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

// --- simple token-bucket rate limiter per IP ---
const BUCKET = new Map(); // ip -> { tokens, updated }
const REFILL_PER_SEC = 2; // allow 2 req/sec
const BURST = 6;          // up to 6 burst

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
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // CDN キャッシュ（関数でも s-maxage は有効。ヒット率向上用）
  if (cacheable && status === 200) {
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.end(JSON.stringify(obj));
}

function ok(res, data, cacheable = true) { send(res, 200, data, cacheable); }
function tooMany(res) { send(res, 429, { items: [], error: 'rate_limited' }); }
function bad(res, msg) { send(res, 400, { items: [], error: msg || 'bad_request' }); }
function fail(res, msg) { send(res, 500, { items: [], error: msg || 'proxy_error' }); }

const LOCAL_FALLBACK = [
  { name: "東京駅", lat: 35.681236, lng: 139.767125, sub: "千代田区", icon: "🚉" },
  { name: "新宿駅", lat: 35.690921, lng: 139.700257, sub: "新宿区", icon: "🚉" },
  { name: "渋谷駅", lat: 35.658034, lng: 139.701636, sub: "渋谷区", icon: "🚉" },
  { name: "品川駅", lat: 35.62876, lng: 139.73894, sub: "港区", icon: "🚉" },
  { name: "横浜駅", lat: 35.46583, lng: 139.622, sub: "西区", icon: "🚉" },
  { name: "名古屋駅", lat: 35.170694, lng: 136.881637, sub: "中村区", icon: "🚉" },
  { name: "大阪駅", lat: 34.702485, lng: 135.495951, sub: "北区", icon: "🚉" },
  { name: "京都駅", lat: 34.985849, lng: 135.758766, sub: "下京区", icon: "🚉" },
  { name: "札幌駅", lat: 43.06866, lng: 141.35076, sub: "北区", icon: "🚉" },
  { name: "福岡空港", lat: 33.5931, lng: 130.451, sub: "福岡", icon: "✈️" },
];

// 駅/ランドマーク系に限定
function keep(it) {
  const cls = it.class;
  const typ = it.type;
  if (cls === 'railway' && (typ === 'station' || typ === 'halt')) return true;
  if (cls === 'aeroway' && (typ === 'aerodrome' || typ === 'terminal')) return true;
  if (cls === 'tourism' && ['attraction', 'museum', 'zoo', 'theme_park', 'viewpoint', 'aquarium'].includes(typ)) return true;
  if (cls === 'leisure' && ['park', 'stadium'].includes(typ)) return true;
  if (cls === 'historic' && ['castle', 'ruins', 'monument', 'memorial'].includes(typ)) return true;
  if (cls === 'natural' && ['peak'].includes(typ)) return true;
  // 都市名など（place）
  if (cls === 'place' && ['city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter'].includes(typ)) return true;
  // 大学/病院などは最小限
  if (cls === 'amenity' && ['university', 'college', 'hospital', 'library'].includes(typ)) return true;
  return false;
}

function iconOf(it) {
  const cls = it.class, typ = it.type;
  if (cls === 'railway') return '🚉';
  if (cls === 'aeroway') return '✈️';
  if (cls === 'tourism') return '📍';
  if (cls === 'leisure') return '🌳';
  if (cls === 'historic') return '🏰';
  if (cls === 'natural') return '⛰️';
  if (cls === 'amenity') return '🏢';
  if (cls === 'place') return '🗺️';
  return '📍';
}

async function callNominatim(params, host) {
  const url = new URL(NOMINATIM);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'ja');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'application/json',
      'Referer': host ? `https://${host}` : '',
    },
  });
  const status = r.status;
  if (status === 429) return { status, data: [] };
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`upstream ${status}: ${text.slice(0, 200)}`);
  }
  const data = await r.json();
  return { status, data: Array.isArray(data) ? data : [] };
}

function cacheGet(key) {
  const hit = CACHE.get(key);
  if (hit && (Date.now() - hit.ts) < TTL_MS) return hit.data;
  return null;
}
function cacheSet(key, data) {
  CACHE.set(key, { ts: Date.now(), data });
}

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, 'http://x');
    const op = u.searchParams.get('op') || 'suggest'; // 'suggest' | 'search'
    const qRaw = (u.searchParams.get('q') || '').trim();
    const limit = Math.min(Number(u.searchParams.get('limit') || '8'), 15);
    const countrycodes = u.searchParams.get('countrycodes') || 'jp';
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '0.0.0.0';
    const host = req.headers['x-forwarded-host'] || req.headers.host || '';

    // rate limit
    if (!allow(ip)) return tooMany(res);

    if (!qRaw) return ok(res, { items: [] });
    if (qRaw.length < 2 && op === 'suggest') return ok(res, { items: [] }); // 1文字は抑制

    const key = `${op}:${countrycodes}:${qRaw.toLowerCase()}:${limit}`;
    const cached = cacheGet(key);
    if (cached) return ok(res, cached);

    // upstream call
    const { status, data } = await callNominatim(
      { q: qRaw, limit, countrycodes, namedetails: 1 },
      host
    );

    // 429 → graceful fallback
    if (status === 429) {
      // サジェストはローカル候補、検索は最初の前方一致
      if (op === 'suggest') {
        const partial = LOCAL_FALLBACK.filter(x => x.name.includes(qRaw)).slice(0, limit);
        const ret = { items: partial };
        cacheSet(key, ret);
        return ok(res, ret);
      } else {
        const first = LOCAL_FALLBACK.find(x => x.name.includes(qRaw));
        const ret = first ? { hit: first } : { hit: null };
        return ok(res, ret);
      }
    }

    // filter → map
    const filtered = data.filter(keep);
    if (op === 'suggest') {
      const items = filtered.slice(0, limit).map(it => {
        const lat = Number(it.lat), lng = Number(it.lon);
        const name = it.namedetails?.name || it.name || (it.address?.station) || (it.display_name?.split(',')[0] || '');
        const sub =
          it.address?.suburb || it.address?.neighbourhood || it.address?.city ||
          it.address?.town || it.address?.village || it.address?.state || '';
        return { name, sub, lat, lng, icon: iconOf(it) };
      });
      const ret = { items };
      cacheSet(key, ret);
      return ok(res, ret, true);
    } else { // search
      const first = filtered[0];
      if (!first) return ok(res, { hit: null });
      const lat = Number(first.lat), lng = Number(first.lon);
      const name = first.namedetails?.name || first.name || (first.address?.station) || (first.display_name?.split(',')[0] || '');
      const sub =
        first.address?.suburb || first.address?.neighbourhood || first.address?.city ||
        first.address?.town || first.address?.village || first.address?.state || '';
      const hit = { name, sub, lat, lng, icon: iconOf(first) };
      const ret = { hit };
      cacheSet(key, ret);
      return ok(res, ret, true);
    }
  } catch (e) {
    fail(res, e.message);
  }
};
