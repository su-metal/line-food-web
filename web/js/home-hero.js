// web/js/home-hero.js
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? Number(v).toLocaleString("ja-JP") : "");

const pickOne = (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);

function minPrice(shop){
  const prices = (shop?.bundles||[])
    .map(b => +b?.price ?? +b?.price_min ?? NaN)
    .filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : (+shop?.min_price || null);
}
function remainRibbon(shop){
  const remains = (shop?.bundles||[]).map(b => +b?.remain || +b?.remaining || 0);
  const min = remains.length ? Math.min(...remains) : 0;
  return min > 0 && min <= 2 ? `当日残り ${min} セットのみ` : "本日のおすすめ";
}
function metaLine(shop){
  const dist = shop?.distance_km ?? shop?.distance ?? null; // km想定
  const d = dist != null ? `${(+dist).toFixed(1)} km` : null;

  // 代表バンドルの時間帯（あれば）
  const b = (shop?.bundles||[])[0];
  const t = b?.time_label || (b?.start && b?.end ? `${b.start}–${b.end}` : null);

  return [d && `📍 ${d}`, t && `🕒 ${t}`].filter(Boolean).join(" ・ ");
}

export async function loadSpotlight() {
  const el = document.getElementById("spotlight");
  if (!el) return;

  let shop = null;

  // まず最近追加
  try {
    const r = await apiJSON("/api/shops-recent?limit=24");
    shop = pickOne((r?.items||[]).filter(s => s?.photo_url));
  } catch {}
  // だめなら近場
  if (!shop) {
    try {
      const n = await apiJSON("/api/nearby?limit=24");
      shop = pickOne((n?.items||[]).filter(s => s?.photo_url));
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
  const total = Math.max((shop?.bundles||[]).length, 1);
  $("sp-count").textContent = `1/${total}`;
}

// 自動実行
document.addEventListener("DOMContentLoaded", () => {
  loadSpotlight().catch(console.warn);
});
