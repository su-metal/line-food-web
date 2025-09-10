// web/js/home-hero.js
// 上段＝最適な1店舗（距離×時間×在庫でスコア）、下段＝同店舗の商品2件
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) =>
  Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "";

/* ---------- safe helpers ---------- */
const pick = (obj, keys) => keys.map((k) => obj?.[k]).find((v) => v != null && v !== "");

/* ---- keys ---- */
const SHOP_IMG_KEYS = ["photo_url", "cover_url", "imageUrl", "image", "thumbnail", "heroImage", "img"];
const SHOP_NAME_KEYS = ["name", "store_name", "title"];
const SHOP_AREA_KEYS = ["area", "station", "city", "address_short", "place", "ward"];
const SHOP_DIST_KEYS = ["distance_km", "distanceKm", "distance_km_text", "distance"];

const PROD_IMG_KEYS = ["thumb_url", "image_url", "image", "thumbnail", "photo_url"];
const PROD_TITLE_KEYS = ["title", "name", "bundle_title"];
const PROD_PRICE_KEYS = ["price_min", "price", "min_price", "sale_price"];
const PROD_STOCK_KEYS = ["remaining", "stock", "left", "available", "qty", "quantity"];
const PROD_START_KEYS = ["pickup_start_at", "start_at", "available_from", "window_start", "startTime"];
const PROD_END_KEYS   = ["pickup_end_at",   "end_at",   "available_to",   "window_end",   "endTime"];

const shopId = (s) => s?.id ?? s?.shop_id ?? s?.shopId ?? s?._id;
const prodId = (p) => p?.id ?? p?.bundle_id ?? p?.product_id ?? p?._id;

/* ---- value getters ---- */
const shopName = (s) => pick(s, SHOP_NAME_KEYS) || "お店";
const shopArea = (s) => pick(s, SHOP_AREA_KEYS) || null;
const shopImg  = (s) => pick(s, SHOP_IMG_KEYS) || NOIMG;
const prodTitle= (p) => pick(p, PROD_TITLE_KEYS) || "おすすめ";
const prodPrice= (p, s) => pick(p, PROD_PRICE_KEYS) ?? s?.min_price ?? null;
const prodImg  = (p, s) => pick(p, PROD_IMG_KEYS) || shopImg(s);
const isFav    = (s) => !!(s?.is_favorite || s?.favorite || s?.fav);

/* 距離（km）を推定 */
function distanceKmOf(s) {
  const raw = pick(s, SHOP_DIST_KEYS);
  if (raw == null) return null;
  if (typeof raw === "number") return raw;
  const m = String(raw).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

/* 在庫数（なければ null） */
function remainingOf(p) {
  const v = pick(p, PROD_STOCK_KEYS);
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* 受け取りウィンドウ（Date） */
function windowOf(p) {
  const toDate = (x) => {
    if (!x) return null;
    if (typeof x === "number") return new Date(x);
    // "2025-09-10T12:00:00+09:00" / "12:00" / "12:00–14:00"
    if (/^\d{2}:\d{2}/.test(x)) {
      const [h, m] = x.split(":").map((n) => parseInt(n, 10));
      const d = new Date();
      d.setHours(h, m || 0, 0, 0);
      return d;
    }
    const d = new Date(x);
    return isNaN(+d) ? null : d;
  };
  let start = toDate(pick(p, PROD_START_KEYS));
  let end   = toDate(pick(p, PROD_END_KEYS));

  // "07:30–09:30" のような文字列フィールドに対応
  if (!start || !end) {
    const txt = [pick(p, PROD_START_KEYS), pick(p, PROD_END_KEYS), p?.window, p?.time, p?.slot]
      .filter(Boolean)
      .find((t) => typeof t === "string" && /[:：]\d{2}.+[-–—].+[:：]\d{2}/.test(t));
    if (txt) {
      const m = txt.replace(/[：—–]/g, ":").replace(/[−–—]/g, "-").match(/(\d{1,2}):(\d{2}).*?(\d{1,2}):(\d{2})/);
      if (m) {
        const d = new Date();
        start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[1], +m[2], 0, 0);
        end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), +m[3], +m[4], 0, 0);
      }
    }
  }
  return { start, end };
}

const minUntil = (date) => (date ? Math.round((date - Date.now()) / 60000) : null);

/* ---------- scoring ---------- */
function scoreShop(shop, products) {
  // 距離（<=5kmを満点、以遠は逓減）
  const dist = distanceKmOf(shop);
  const distScore = dist == null ? 0.6 : Math.max(0, Math.min(1, 1 - dist / 5));

  // 時間（開始まで0分=満点 / 180分で0）
  let soonMin = null;
  for (const p of products) {
    const { start, end } = windowOf(p);
    // すでにウィンドウ中なら 0 扱い
    const m = start && end && Date.now() >= +start && Date.now() <= +end ? 0 : minUntil(start);
    if (m != null) soonMin = soonMin == null ? m : Math.min(soonMin, m);
  }
  const timeScore = soonMin == null ? 0.5 : Math.max(0, Math.min(1, 1 - soonMin / 180));

  // 在庫（残り>0があれば加点）
  const hasStock = products.some((p) => (remainingOf(p) ?? 1) > 0);
  const stockScore = hasStock ? 1 : 0;

  // お気に入り微加点
  const favScore = isFav(shop) ? 1 : 0;

  // 重み：距離0.4 / 時間0.4 / 在庫0.15 / お気に入り0.05
  return distScore * 0.4 + timeScore * 0.4 + stockScore * 0.15 + favScore * 0.05;
}

/* ---------- data fetch ---------- */
async function safeFetchList(url) {
  try {
    const json = await apiJSON(url);
    if (Array.isArray(json)) return json;
    if (Array.isArray(json?.items)) return json.items;
    if (json) return [json];
  } catch (e) {
    console.warn("[home-hero] fetch fail:", url, e);
  }
  return [];
}

async function fetchCandidateShops() {
  // 近場優先 → だめなら新着
  let shops = await safeFetchList("/api/nearby?limit=24");
  if (!shops.length) shops = await safeFetchList("/api/shops-recent?limit=24");
  return shops;
}

async function fetchProductsOfShop(shop) {
  // 店舗JSON内の埋め込みを最初に使う
  const embedded =
    (Array.isArray(shop?.bundles) && shop.bundles.length && shop.bundles) ||
    (Array.isArray(shop?.products) && shop.products.length && shop.products) ||
    [];
  if (embedded.length) return embedded;

  // API 候補
  const id = shopId(shop);
  if (!id) return [];
  const candidates = [
    `/api/shops/${encodeURIComponent(id)}/products?limit=20&random=1`,
    `/api/stores/${encodeURIComponent(id)}/products?limit=20&random=1`,
    `/api/products?shopId=${encodeURIComponent(id)}&limit=20&random=1`,
    `/api/bundles?shopId=${encodeURIComponent(id)}&limit=20`,
  ];
  for (const u of candidates) {
    const items = await safeFetchList(u);
    if (items.length) return items;
  }
  return [];
}

/* ---------- choose best shop ---------- */
async function chooseHeroShop() {
  const shops = await fetchCandidateShops();
  if (!shops.length) return null;

  // 候補を最大8件に絞り、各店舗の商品を取得してスコア
  const candidates = shops.slice(0, 8);
  const enriched = await Promise.all(
    candidates.map(async (s) => {
      const products = await fetchProductsOfShop(s);
      return { shop: s, products, score: scoreShop(s, products) };
    })
  );

  // スコア高い順
  enriched.sort((a, b) => b.score - a.score);
  return enriched[0] ?? null;
}

/* ---------- DOM apply ---------- */
function ensureMetaRow() {
  const root = document.querySelector("#hero-card-main");
  if (!root) return null;
  let row = root.querySelector(".hero-meta");
  if (!row) {
    row = document.createElement("div");
    row.className = "hero-meta";
    root.appendChild(row);
  } else {
    row.textContent = "";
  }
  return row;
}

function addPill(row, text, cls = "") {
  if (!row || !text) return;
  const span = document.createElement("span");
  span.className = `pill ${cls}`.trim();
  span.textContent = text;
  row.appendChild(span);
}

function setMainHero(shop, products) {
  const name = shopName(shop);
  const area = shopArea(shop);
  const img = shopImg(shop);

  const a = document.querySelector("#hero-card-main");
  if (a) a.href = shopId(shop) ? `/shop.html?id=${encodeURIComponent(shopId(shop))}` : "#";

  const title = document.querySelector("#hero-title");
  if (title) title.textContent = name;

  // 一番近い時間帯をサブに
  let subText = area ?? "";
  const tmins = products
    .map((p) => ({ ...windowOf(p), p }))
    .filter(({ start }) => !!start)
    .sort((x, y) => (+x.start) - (+y.start))[0];

  if (tmins?.start && tmins?.end) {
    const hhmm = (d) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    const line = `${hhmm(tmins.start)}–${hhmm(tmins.end)}`;
    subText = area ? `${area}・${line}` : line;
  }
  const sub = document.querySelector("#hero-sub");
  if (sub) sub.textContent = subText || "本日のおすすめ";

  const im = document.querySelector("#hero-img-main");
  if (im && img) {
    im.src = img;
    im.alt = name;
    im.loading = "eager";
    im.decoding = "async";
  }

  // メタピル（左上）：距離・時間・在庫
  const row = ensureMetaRow();
  const dk = distanceKmOf(shop);
  addPill(row, dk != null ? `${dk.toFixed(1)} km` : null);
  if (tmins?.start && tmins?.end) {
    const hhmm = (d) => String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    addPill(row, `${hhmm(tmins.start)}–${hhmm(tmins.end)}`);
  }
  const scarce = products
    .map((p) => remainingOf(p))
    .filter((n) => n != null)
    .sort((a, b) => a - b)[0];
  addPill(row, scarce != null ? `残り${scarce}個` : null, "warn");
}

function setSmallCard(idx, item) {
  const root = document.getElementById(`hero-card-s${idx}`);
  const imgEl = document.getElementById(`hero-s${idx}-img`);
  const capEl = document.getElementById(`hero-s${idx}-cap`);
  if (!root) return;

  if (imgEl && item.img) {
    imgEl.src = item.img;
    imgEl.alt = `${item.shop ?? ""} ${item.title ?? ""}`.trim() || "おすすめ";
    imgEl.loading = "lazy";
    imgEl.decoding = "async";
  }
  if (capEl) {
    const priceText = item.price != null ? `（${yen(item.price)}）` : "";
    capEl.textContent = `${item.title ?? "おすすめ"}${priceText}`;
  }
  if (item.href) root.href = item.href;
}

/* 2件選ぶ：残りわずか → 価格安い → 画像あり を優先 */
function chooseTwoProducts(products, shop) {
  const scoreP = (p) => {
    const rem = remainingOf(p);
    const price = prodPrice(p, shop);
    const img = !!prodImg(p, shop);
    // 残り少ないほど高スコア、価格安いほど高スコア、画像あり加点
    const r = rem == null ? 0.2 : (rem <= 0 ? 0 : 1 / (rem + 1)); // 1,1/2,1/3...
    const psc = Number.isFinite(+price) ? 1 / (Number(price) + 1) : 0.3;
    const imgsc = img ? 0.1 : 0;
    return r * 0.6 + psc * 0.3 + imgsc * 0.1;
  };
  const arr = products.slice().sort((a, b) => scoreP(b) - scoreP(a));
  return [arr[0], arr[1] ?? arr[0]].filter(Boolean);
}

/* ---------- main ---------- */
async function initSmartHero() {
  try {
    const chosen = await chooseHeroShop();
    if (!chosen) return;

    const { shop, products } = chosen;
    setMainHero(shop, products);

    const [p1, p2] = chooseTwoProducts(products, shop);
    if (p1) {
      setSmallCard(1, {
        title: prodTitle(p1),
        price: prodPrice(p1, shop),
        shop: shopName(shop),
        img: prodImg(p1, shop),
        href: prodId(p1) ? `/product.html?id=${encodeURIComponent(prodId(p1))}` : `/shop.html?id=${encodeURIComponent(shopId(shop))}`,
      });
    }
    if (p2) {
      setSmallCard(2, {
        title: prodTitle(p2),
        price: prodPrice(p2, shop),
        shop: shopName(shop),
        img: prodImg(p2, shop),
        href: prodId(p2) ? `/product.html?id=${encodeURIComponent(prodId(p2))}` : `/shop.html?id=${encodeURIComponent(shopId(shop))}`,
      });
    }
  } catch (e) {
    console.warn("[home-hero] fatal", e);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initSmartHero();
});
