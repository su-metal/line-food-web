// web/js/home-hero.js
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) =>
  Number.isFinite(+v) ? Number(v).toLocaleString("ja-JP") : "";

const pickOne = (arr) =>
  Array.isArray(arr) && arr.length
    ? arr[Math.floor(Math.random() * arr.length)]
    : null;

function minPrice(shop) {
  const prices = (shop?.bundles || [])
    .map((b) => +b?.price ?? +b?.price_min ?? NaN)
    .filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : +shop?.min_price || null;
}
function remainRibbon(shop) {
  const remains = (shop?.bundles || []).map(
    (b) => +b?.remain || +b?.remaining || 0
  );
  const min = remains.length ? Math.min(...remains) : 0;
  return min > 0 && min <= 2 ? `当日残り ${min} セットのみ` : "本日のおすすめ";
}
function metaLine(shop) {
  const dist = shop?.distance_km ?? shop?.distance ?? null; // km想定
  const d = dist != null ? `${(+dist).toFixed(1)} km` : null;

  // 代表バンドルの時間帯（あれば）
  const b = (shop?.bundles || [])[0];
  const t =
    b?.time_label || (b?.start && b?.end ? `${b.start}–${b.end}` : null);

  return [d && `📍 ${d}`, t && `🕒 ${t}`].filter(Boolean).join(" ・ ");
}
// 画像の下の「カテゴリ／距離／場所」を更新するユーティリティ
function updateSpotlightMeta(shop = {}, distanceKm = null){
  const $ = (id) => document.getElementById(id);
  const fmtKm = (v) => (typeof v === "number" ? `${v.toFixed(v < 1 ? 1 : 1)} km` : "");

  const cat   = shop.category_name || shop.category || "ベーカリー";
  const dist  = fmtKm(distanceKm ?? shop.distance_km);
  const place = shop.area || shop.city || shop.station || shop.address_short || "";

  const elCat = $("sp-cat"), elDist = $("sp-dist"), elPlace = $("sp-place");
  if (elCat)   elCat.textContent   = cat;
  if (elDist)  elDist.textContent  = dist || "—";
  if (elPlace) elPlace.textContent = place || "";
}


export async function loadSpotlight() {
  const el = document.getElementById("spotlight");
  if (!el) return;

  let shop = null;

  // まず最近追加
  try {
    const r = await apiJSON("/api/shops-recent?limit=24");
    shop = pickOne((r?.items || []).filter((s) => s?.photo_url));
  } catch {}
  // だめなら近場
  if (!shop) {
    try {
      const n = await apiJSON("/api/nearby?limit=24");
      shop = pickOne((n?.items || []).filter((s) => s?.photo_url));
    } catch {}
  }
  if (!shop) return;

  const link = `/shop.html?id=${encodeURIComponent(shop.id)}`;
  const img = shop.photo_url || NOIMG;

  // 埋め込み
  const $ = (id) => document.getElementById(id);
  $("sp-link").href = link;
  $("sp-img").src = img;
  $("sp-img").alt = shop?.name || "おすすめ";
  $("sp-title").textContent = shop?.name || "おすすめ";
  $("sp-meta").textContent = metaLine(shop);

  const price = minPrice(shop);
  if (price != null) $("sp-price").textContent = yen(price);
  $("sp-ribbon").textContent = remainRibbon(shop);

  // 画像枚数（仮で bundles 数を利用。なければ 1/1）
  const total = Math.max((shop?.bundles || []).length, 1);
  $("sp-count").textContent = `1/${total}`;
}

// 既存の import/apiJSON 等はそのまま

function km(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + " km";
}

function pickCat(s) {
  return (
    s?.category ??
    s?.category_name ??
    s?.tags?.[0] ??
    s?.genres?.[0] ??
    "その他"
  );
}

function pickPlace(s) {
  // 住所/駅/エリアなど、短く出せるものを優先
  return (
    s?.area_name ||
    s?.near_station ||
    s?.ward ||
    s?.city ||
    s?.address?.split(/[ ,、　]/)?.[0] ||
    "エリア情報なし"
  );
}

// …（カード構築処理の中で）画像や店名を入れている箇所の直後に追加:
const catEl = document.getElementById("ag-cat");
const distEl = document.getElementById("ag-dist");
const placeEl = document.getElementById("ag-place");

if (catEl) catEl.textContent = pickCat(shop);
if (distEl) {
  const d = km(shop?.distance_km ?? shop?.distance);
  distEl.textContent = d ?? "—";
}
if (placeEl) placeEl.textContent = pickPlace(shop);

// 自動実行
document.addEventListener("DOMContentLoaded", () => {
  loadSpotlight().catch(console.warn);
});

// 既存：タイトルや画像をセット
document.getElementById("sp-title").textContent = shop.name;
document.getElementById("sp-img").src = shop.photo_url;
// 追加：メタ更新
updateSpotlightMeta(shop, shop.distance_km);

