// web/js/home-hero.js
import { apiJSON } from "./http.js";

const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? Number(v).toLocaleString("ja-JP") : "");

const pickOne = (arr) =>
  Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;

function minPrice(shop) {
  const prices = (shop?.bundles || [])
    .map((b) => +b?.price ?? +b?.price_min ?? NaN)
    .filter(Number.isFinite);
  return prices.length ? Math.min(...prices) : +shop?.min_price || null;
}

function remainRibbon(shop) {
  const remains = (shop?.bundles || []).map((b) => +b?.remain || +b?.remaining || 0);
  const min = remains.length ? Math.min(...remains) : 0;
  return min > 0 && min <= 2 ? `当日残り ${min} セットのみ` : "本日のおすすめ";
}

/* ---------- メタ（カテゴリ / 距離 / 場所）を常に“チップ”で描画する ---------- */
function fillMetaChips(shop = {}) {
  const host = document.getElementById("sp-meta");
  if (!host) return;

  const cat =
    shop.category_name ||
    shop.category ||
    shop.tags?.[0] ||
    shop.genres?.[0] ||
    "カテゴリ";

  const distVal = Number(shop.distance_km ?? shop.distance);
  const dist =
    Number.isFinite(distVal) ? (distVal >= 10 ? distVal.toFixed(0) : distVal.toFixed(1)) + " km" : "—";

  const place =
    shop.area ||
    shop.city ||
    shop.station ||
    shop.address_short ||
    (shop.address ? String(shop.address).split(/[ ,、　]/)[0] : "") ||
    "";

  host.innerHTML = `
    <span class="chip brand">${cat}</span>
    <span class="chip">${dist}</span>
    <span class="place">${place}</span>
  `;
}

/* ---------- ヒーローの本体を埋める ---------- */
async function loadSpotlight() {
  const card = document.getElementById("spotlight");
  if (!card) return;

  let shop = null;

  // 1) 最近追加から
  try {
    const r = await apiJSON("/api/shops-recent?limit=24");
    shop = pickOne((r?.items || []).filter((s) => s?.photo_url));
  } catch (e) {
    console.warn("[spotlight] recent failed", e);
  }

  // 2) なければ近場
  if (!shop) {
    try {
      const n = await apiJSON("/api/nearby?limit=24");
      shop = pickOne((n?.items || []).filter((s) => s?.photo_url));
    } catch (e) {
      console.warn("[spotlight] nearby failed", e);
    }
  }
  if (!shop) return;

  const $ = (id) => document.getElementById(id);

  const link = `/shop.html?id=${encodeURIComponent(shop.id)}`;
  const img = shop.photo_url || NOIMG;

  // 画像/リンク/タイトル
  $("sp-link").href = link;
  $("sp-img").src = img;
  $("sp-img").alt = shop?.name || "おすすめ";
  $("sp-title").textContent = shop?.name || "おすすめ";

  // ★ ここを“テキスト代入”ではなく常にチップで更新
  fillMetaChips(shop);

  // 価格 / リボン / カウント
  const price = minPrice(shop);
  if (price != null) $("sp-price").textContent = yen(price);
  $("sp-ribbon")?.setAttribute?.("hidden", "hidden"); // 仕様で非表示にしたい場合
  const total = Math.max((shop?.bundles || []).length, 1);
  $("sp-count").textContent = `1/${total}`;

  // 左上フラグ（.sp-flag）も必要なら更新
  const flag = document.querySelector(".sp-flag");
  if (flag) flag.textContent = remainRibbon(shop);
}

/* ---------- 初期化（DOM読み込み後1回だけ） ---------- */
document.addEventListener("DOMContentLoaded", () => {
  loadSpotlight().catch((e) => console.warn("[spotlight] fatal", e));
});


