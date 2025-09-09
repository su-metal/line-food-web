// web/js/recent.js
import { apiJSON } from "./http.js";

/* ===== Utils ===== */
const NOIMG = "./img/noimg.svg";
const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
const safe = (v) => (v == null ? "" : String(v));
const fmtDistance = (m) =>
  Number.isFinite(m)
    ? m < 1000
      ? `${Math.round(m)} m`
      : `${(m / 1000).toFixed(1)} km`
    : "";
const titleOf = (b) => b?.title ?? b?.name ?? b?.bundle_title ?? "";
const priceOf = (b, s) => b?.price ?? b?.price_min ?? s?.min_price ?? null;
const stockOf = (b, s) =>
  b?.qty_available ?? b?.stock ?? s?.stock_remain ?? null;
const slotOf = (b) => b?.slot_label ?? b?.slot ?? b?.time ?? "";

// 既存の createCard を丸ごと置き換え
// === 置き換え: createCard(s) 全体 ===
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  if (!tpl) {
    const a = document.createElement("article");
    a.className = "shop-card";
    a.textContent = safe(s.name || "店舗");
    return a;
  }
  const el = tpl.content.firstElementChild.cloneNode(true);

  // dataset
  el.dataset.shopId = safe(s.id || "");

  // 画像
  const imgEl = el.querySelector(".thumb img");
  if (imgEl) {
    imgEl.src = s.photo_url || NOIMG;
    imgEl.alt = safe(s.name || "");
  }

  // お気に入り
  const favBtn = el.querySelector(".heart.fav-btn");
  if (favBtn) favBtn.dataset.shopId = safe(s.id || "");

  // サムネ内テキスト
  const titleEl = el.querySelector(".thumb-title");
  if (titleEl) titleEl.textContent = safe(s.name || "");
  const catEl = el.querySelector(".thumb-subline .point");
  if (catEl) catEl.textContent = safe(s.category || "");
  const placeEl = el.querySelector(".thumb-subline .place");
  if (placeEl) placeEl.textContent = safe(s.address || "");

  // ▼ 商品概要（bundles 最大2件）ここから置き換え
  const container0 = el.querySelector(".shop-info");
  if (container0) container0.innerHTML = ""; // ダミー行を完全クリア

  // API の bundles から最大2件だけ使う
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  // .shop-info が無ければ作る
  let container = el.querySelector(".shop-info");
  if (!container) {
    container = document.createElement("div");
    container.className = "shop-info";
    el.appendChild(container);
  }

  // 1行分を作って埋める
  function renderRow(b) {
    const row = document.createElement("div");
    row.className = "product-summary";
    row.innerHTML = `
    <img class="product-img" alt="">
    <div class="product-main">
      <div class="product-name"></div>
      <div class="product-meta">
        <span class="time"></span>
        <span class="eta" hidden></span>
      </div>
    </div>
    <div class="ps-aside">
      <span class="stock-inline" hidden></span>
      <span class="price-inline" hidden></span>
    </div>
  `;

    // 画像
    const img = row.querySelector(".product-img");
    if (img) {
      img.src = b.thumb_url || s.photo_url || NOIMG;
      img.alt = `${b.title ?? b.name ?? "おすすめセット"} の画像`;
    }

    // タイトル
    const nameEl = row.querySelector(".product-name");
    if (nameEl) nameEl.textContent = b.title ?? b.name ?? "おすすめセット";

    // 時間帯
    const slotLabel = b.slot_label ?? b.slot ?? b.time ?? "";
    const timeEl = row.querySelector(".time");
    if (timeEl) timeEl.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

    // 価格（bundle → shop の順で拾う）
    const priceEl = row.querySelector(".price-inline");
    const priceVal = [b.price_min, b.price, s.min_price]
      .map(Number)
      .find((n) => Number.isFinite(n));
    if (priceEl) {
      if (Number.isFinite(priceVal)) {
        priceEl.textContent = yen(priceVal);
        priceEl.hidden = false;
        priceEl.classList.add("show");
      } else {
        priceEl.hidden = true;
        priceEl.classList.remove("show");
      }
    }

    // 在庫（bundle優先）
    const stockEl = row.querySelector(".stock-inline");
    const remain = [b.qty_available, b.stock, s.stock_remain]
      .map((n) => Number(n))
      .find((n) => Number.isFinite(n));
    if (stockEl) {
      if (Number.isFinite(remain) && remain > 0) {
        stockEl.textContent = `残り${remain}個`;
        stockEl.hidden = false;
        stockEl.classList.add("show");
      } else {
        stockEl.hidden = true;
        stockEl.classList.remove("show");
      }
    }

    return row;
  }

  // 描画
  if (bundles.length === 0) {
    // 何も無ければ .shop-info 自体を消す
    container.remove();
  } else {
    bundles.forEach((b) => container.appendChild(renderRow(b)));

    // “他 n セット”
    const remainCnt =
      (Array.isArray(s.bundles) ? s.bundles.length : 0) - bundles.length;
    if (remainCnt > 0) {
      const moreWrap = document.createElement("div");
      moreWrap.className = "more-wrap";
      moreWrap.innerHTML = `<button class="more-bundles">他 ${remainCnt} セット</button>`;
      container.appendChild(moreWrap);
    }
  }
  // ▼ 商品概要 ここまで

  return el;
}

/* ===== API loader ===== */
export async function loadRecent({
  category = null,
  priceMax = null,
  limit = 6,
} = {}) {
  const row = document.getElementById("recent-row");
  if (!row) return;

  row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込み中…</h4></div></div></article>`;

  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (Number.isFinite(priceMax)) qs.set("priceMax", String(priceMax));
  qs.set("limit", String(limit));

  try {
    const data = await apiJSON(`/api/shops-recent?${qs.toString()}`);
    row.innerHTML = "";

    const items = (data.items || []).slice(0, limit);
    if (!items.length) {
      row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>新着がありません</h4></div></div></article>`;
      return;
    }

    for (const s of items) row.appendChild(createCard(s));

    // お気に入りの初期化
    try {
      const fav = await import("./fav.js");
      fav.initAllFavButtons?.();
    } catch {}
  } catch (e) {
    console.warn("[recent] failed", e?.status, e?.body || e);
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込みに失敗しました</h4></div></div></article>`;
  }
}
