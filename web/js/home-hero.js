// web/js/home-hero.js
import { apiJSON } from "./http.js";

/* =========================================================
   Spotlight (Agoda-like) - シンプル＆堅牢版
   - ランダムで店舗1件を取得（recent -> fallback: nearby）
   - 画像/店名/価格/リボン/枚数 を反映
   - カテゴリ/距離/場所 は Shadow DOM で安全に描画
   ========================================================= */

const NOIMG = "./img/noimg.svg";

/* ---------- helpers ---------- */
const yen = (v) =>
  Number.isFinite(+v) ? Number(v).toLocaleString("ja-JP") : "";

const pickOne = (arr) =>
  Array.isArray(arr) && arr.length
    ? arr[Math.floor(Math.random() * arr.length)]
    : null;

function minPrice(shop) {
  const prices = (shop?.bundles || [])
    .map((b) => {
      const p = b?.price ?? b?.price_min;
      return Number.isFinite(+p) ? +p : NaN;
    })
    .filter(Number.isFinite);

  if (prices.length) return Math.min(...prices);
  const fallback = +shop?.min_price;
  return Number.isFinite(fallback) ? fallback : null;
}

function remainRibbon(shop) {
  const remains = (shop?.bundles || []).map(
    (b) => +b?.remain || +b?.remaining || 0
  );
  const min = remains.length ? Math.min(...remains) : 0;
  return min > 0 && min <= 2 ? `当日残り ${min} セットのみ` : "本日のおすすめ";
}

function pickCat(s) {
  return (
    s?.category_name ??
    s?.category ??
    s?.tags?.[0] ??
    s?.genres?.[0] ??
    "カテゴリ"
  );
}
function pickPlace(s) {
  // 住所/駅/エリアなど、短く出せるものを優先
  return (
    s?.area ||
    s?.area_name ||
    s?.near_station ||
    s?.station ||
    s?.ward ||
    s?.city ||
    s?.address_short ||
    (typeof s?.address === "string" ? s.address.split(/[ ,、　]/)?.[0] : "") ||
    ""
  );
}
function fmtKm(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return (n >= 10 ? n.toFixed(0) : n.toFixed(1)) + " km";
}

/* ---------- Meta (カテゴリ/距離/場所) を Shadow DOM で描画 ---------- */
function renderSpotlightMeta(shop = {}, distanceKm = null) {
  const host = document.getElementById("sp-meta");
  if (!host) return;

  if (!host.shadowRoot) {
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display:block; }
        .meta{ display:flex; flex-wrap:wrap; gap:8px; margin-top:6px; align-items:center; }
        .chip{
          display:inline-flex; align-items:center; gap:.35em;
          height:26px; padding:0 10px; border-radius:999px;
          border:1px solid color-mix(in srgb, var(--brand) 18%, transparent);
          background:#fff; color:var(--ink); font-size:12.5px; font-weight:700;
          white-space:nowrap;
        }
        .chip.brand{ background:var(--brand); border-color:var(--brand); color:#fff; }
        .place{ color:var(--muted); font-size:12.5px; font-weight:600; white-space:nowrap; }
      </style>
      <div class="meta" part="meta">
        <span id="cat"   class="chip brand">カテゴリ</span>
        <span id="dist"  class="chip">-- km</span>
        <span id="place" class="place">エリア / 最寄り</span>
      </div>
    `;
  }

  const r = host.shadowRoot;
  const cat = pickCat(shop);
  const dist = fmtKm(distanceKm ?? shop?.distance_km ?? shop?.distance);
  const place = pickPlace(shop);

  r.getElementById("cat").textContent = cat || "カテゴリ";
  r.getElementById("dist").textContent = dist || "—";
  r.getElementById("place").textContent = place || "";
}

/* ---------- DOM反映（1店舗分） ---------- */
function hydrateSpotlight(shop) {
  const $ = (id) => document.getElementById(id);
  const linkEl = $("sp-link");
  const imgEl = $("sp-img");
  const titleEl = $("sp-title");
  const priceEl = $("sp-price");
  const ribbonEl = $("sp-ribbon");
  const countEl = $("sp-count");

  const link = shop?.id ? `/shop.html?id=${encodeURIComponent(shop.id)}` : "#";
  const img = shop?.photo_url || shop?.cover_url || NOIMG;

  if (linkEl) linkEl.href = link;
  if (imgEl) {
    imgEl.src = img;
    imgEl.alt = shop?.name || "おすすめ";
  }
  if (titleEl) titleEl.textContent = shop?.name || "おすすめ店舗";

  const price = minPrice(shop);
  if (priceEl) priceEl.textContent = price != null ? yen(price) : "";
  if (ribbonEl) ribbonEl.textContent = remainRibbon(shop);

  // 画像枚数（仮：bundles数 → 無ければ 1/1）
  if (countEl) {
    const total = Math.max((shop?.bundles || []).length, 1);
    countEl.textContent = `1/${total}`;
  }

  // カテゴリ/距離/場所（Shadow DOM）
  renderSpotlightMeta(shop, shop?.distance_km ?? shop?.distance);
}

/* ---------- データ取得 → 反映 ---------- */
export async function loadSpotlight() {
  const card = document.getElementById("spotlight");
  if (!card) return;

  let shop = null;

  // 1) 最近追加からランダム
  try {
    const r = await apiJSON("/api/shops-recent?limit=24");
    const items = (r?.items || []).filter((s) => s?.photo_url);
    if (items.length) shop = pickOne(items);
  } catch (e) {
    console.warn("[spotlight] recent fetch failed", e);
  }

  // 2) 取れなければ近場からランダム
  if (!shop) {
    try {
      const n = await apiJSON("/api/nearby?limit=24");
      const items = (n?.items || []).filter((s) => s?.photo_url);
      if (items.length) shop = pickOne(items);
    } catch (e) {
      console.warn("[spotlight] nearby fetch failed", e);
    }
  }

  if (!shop) return; // 何も取れなければ無視
  hydrateSpotlight(shop);
}

function hydrateSpotlight(shop) {
  const $ = (id) => document.getElementById(id);
  // ...既存の反映処理...

  // 左上バッジを固定表示
  const flagEl = $("sp-flag");
  if (flagEl) flagEl.textContent = "本日のおすすめ";
}

/* ---------- 起動 ---------- */
document.addEventListener("DOMContentLoaded", () => {
  // 二重初期化ガード
  if (window.__loadSpotlightInited) return;
  window.__loadSpotlightInited = true;

  loadSpotlight().catch((e) => console.warn("[spotlight] fatal", e));
});
