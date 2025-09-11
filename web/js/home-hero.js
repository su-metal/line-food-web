// web/js/home-hero.js  — clean one-pass spotlight
// 重複を排除し、1ファイル1責務（スポットライトの描画）に集約
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? Number(v).toLocaleString("ja-JP") : "");

// ---------- helpers ----------
const pickOne = (arr) =>
  Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

const km = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + " km";
};

const pickCat = (s) =>
  s?.category ?? s?.category_name ?? s?.tags?.[0] ?? s?.genres?.[0] ?? "その他";

const pickPlace = (s) =>
  s?.area_name ||
  s?.near_station ||
  s?.ward ||
  s?.city ||
  (typeof s?.address === "string" ? s.address.split(/[ ,、　]/)[0] : "") ||
  "";

function minPrice(shop) {
  const prices = (shop?.bundles || [])
    .map((b) => +b?.price ?? +b?.price_min ?? NaN)
    .filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : +(shop?.min_price ?? NaN);
}

function remainRibbon(shop) {
  const remains = (shop?.bundles || []).map((b) => +b?.remain || +b?.remaining || 0);
  const min = remains.length ? Math.min(...remains) : 0;
  return min > 0 && min <= 2 ? `当日残り ${min} セットのみ` : "本日のおすすめ";
}

function detailMeta(shop) {
  const cat = pickCat(shop);
  const dist = km(shop?.distance_km ?? shop?.distance);
  const place = pickPlace(shop);
  return [cat, dist, place].filter(Boolean).join(" ・ ");
}

// ---------- main ----------
async function chooseShop() {
  // 1) 最近追加から画像ありを優先
  try {
    const r = await apiJSON("/api/shops-recent?limit=24");
    const s = pickOne((r?.items || []).filter((x) => x?.photo_url));
    if (s) return s;
  } catch (e) {
    console.warn("[home-hero] recent fetch failed:", e);
  }
  // 2) だめなら近場
  try {
    const n = await apiJSON("/api/nearby?limit=24");
    const s = pickOne((n?.items || []).filter((x) => x?.photo_url));
    if (s) return s;
  } catch (e) {
    console.warn("[home-hero] nearby fetch failed:", e);
  }
  return null;
}

function hydrateSpotlight(shop) {
  const $ = (id) => document.getElementById(id);
  if (!shop) return;

  const linkEl = $("sp-link");
  const imgEl = $("sp-img");
  const titleEl = $("sp-title");
  const metaEl = $("sp-meta");
  const priceEl = $("sp-price");
  const ribbonEl = $("sp-ribbon");
  const countEl = $("sp-count");
  const flagEl = $("sp-flag");

  const link = shop?.id ? `/shop.html?id=${encodeURIComponent(shop.id)}` : "#";
  const img = shop?.photo_url || NOIMG;

  if (linkEl) linkEl.href = link;
  if (imgEl) {
    imgEl.src = img;
    imgEl.alt = shop?.name || "おすすめ";
    imgEl.loading = "lazy";
    imgEl.decoding = "async";
  }
  if (titleEl) titleEl.textContent = shop?.name || "おすすめ";
  if (metaEl) metaEl.textContent = detailMeta(shop);

  const p = minPrice(shop);
  if (priceEl) priceEl.textContent = p != null && Number.isFinite(+p) ? yen(p) : "";

  if (ribbonEl) ribbonEl.textContent = remainRibbon(shop);
  if (countEl) {
    const total = Math.max((shop?.bundles || []).length, 1);
    countEl.textContent = `1/${total}`;
  }

  // 左上バッジ（常時）
  if (flagEl) flagEl.textContent = "本日のおすすめ";
}

export async function loadSpotlight() {
  const root = document.getElementById("spotlight");
  if (!root) return;
  const shop = await chooseShop();
  hydrateSpotlight(shop);
}

// 自動実行（ホーム限定）
document.addEventListener("DOMContentLoaded", () => {
  try {
    loadSpotlight();
  } catch (e) {
    console.warn("[home-hero] fatal", e);
  }
});
