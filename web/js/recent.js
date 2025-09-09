// web/js/recent.js
import { apiJSON } from "./http.js";

/* ===== Utils ===== */
const NOIMG = "./img/noimg.svg";
const yen   = (v) => "¥" + Number(v).toLocaleString("ja-JP");
const safe  = (v) => (v == null ? "" : String(v));

// bundle値の吸い上げ（APIのキー揺れに耐性）
const titleOf = (b) => b?.title ?? b?.name ?? b?.bundle_title ?? "";
const priceOf = (b, s) => {
  const cand = [b?.price_min, b?.price, s?.min_price].map(Number);
  const v = cand.find((x) => Number.isFinite(x));
  return Number.isFinite(v) ? v : null;
};
const stockOf = (b, s) => {
  const cand = [b?.qty_available, b?.stock, s?.stock_remain].map(Number);
  const v = cand.find((x) => Number.isFinite(x));
  return Number.isFinite(v) ? v : null;
};
const slotOf = (b) => b?.slot_label ?? b?.slot ?? b?.time ?? "";

/* ===== Card factory ===== */
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  if (!tpl) {
    const a = document.createElement("article");
    a.className = "shop-card";
    a.textContent = safe(s.name || "店舗");
    return a;
  }

  const el = tpl.content.firstElementChild.cloneNode(true);

  // お気に入り
  const favBtn = el.querySelector(".fav-btn, .heart");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // サムネ画像
  const imgEl = el.querySelector(".thumb img, .avatar img");
  if (imgEl) {
    imgEl.src = s.photo_url || NOIMG;
    imgEl.alt = safe(s.name || "店舗画像");
    imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = NOIMG; };
  }

  // タイトル/カテゴリ/住所（recent は距離表示なし）
  const titleEl = el.querySelector(".thumb-title, .title, .shop-title, .product-name, h4");
  if (titleEl) titleEl.textContent = safe(s.name || "");

  const catEl = el.querySelector(".point, .chip.cat, .cat, .category");
  if (catEl) catEl.textContent = safe(s.category || "");

  const distEl = el.querySelector(".status, .chip.distance, .distance");
  if (distEl) distEl.textContent = ""; // recent では空

  const placeEl = el.querySelector(".place, .chip.place, .addr, .address");
  if (placeEl) placeEl.textContent = safe(s.address || "");

  // ------- 商品概要（bundles 最大2件） -------
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  // コンテナ（テンプレに無ければ生成）
  let info = el.querySelector(".shop-info, .variants, .list, .body");
  if (!info) {
    info = document.createElement("div");
    info.className = "shop-info";
    el.appendChild(info);
  }

  // 行テンプレ（テンプレに product-summary が無ければ生成）
  const existingRow = el.querySelector(".shop-info .product-summary");
  const makeRow = () => {
    if (existingRow) return existingRow.cloneNode(true);
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
      </div>`;
    return row;
  };

  const setRow = (rowEl, b) => {
    const pImg = rowEl.querySelector(".product-img");
    if (pImg) {
      pImg.src = b?.thumb_url || s.photo_url || NOIMG;
      pImg.alt = `${safe(titleOf(b) || "おすすめセット")} の画像`;
      pImg.onerror = () => { pImg.onerror = null; pImg.src = NOIMG; };
    }

    const pName = rowEl.querySelector(".product-name");
    if (pName) pName.textContent = safe(titleOf(b) || "おすすめセット");

    const timeEl = rowEl.querySelector(".time");
    const slotLabel = slotOf(b);
    if (timeEl) timeEl.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

    const priceEl = rowEl.querySelector(".price-inline");
    const pv = priceOf(b, s);
    if (priceEl) {
      if (pv != null) {
        priceEl.textContent = yen(pv);
        priceEl.hidden = false;
        priceEl.classList.add("show");
      } else {
        priceEl.hidden = true;
        priceEl.classList.remove("show");
      }
    }

    const stockEl = rowEl.querySelector(".stock-inline");
    const sv = stockOf(b, s);
    if (stockEl) {
      if (sv != null && sv > 0) {
        stockEl.textContent = `残り${sv}個`;
        stockEl.hidden = false;
        stockEl.classList.add("show");
      } else {
        stockEl.hidden = true;
        stockEl.classList.remove("show");
      }
    }
  };

  const slot = el.querySelector(".shop-info") || info;
  slot.innerHTML = "";
  if (bundles.length) {
    const first = makeRow();
    setRow(first, bundles[0]);
    slot.appendChild(first);

    if (bundles[1]) {
      const second = makeRow();
      setRow(second, bundles[1]);
      slot.appendChild(second);
    }

    const remainCnt =
      (Array.isArray(s.bundles) ? s.bundles.length : 0) - bundles.length;
    if (remainCnt > 0) {
      const moreWrap = document.createElement("div");
      moreWrap.className = "more-wrap";
      moreWrap.innerHTML = `<button class="more-bundles">他 ${remainCnt} セット</button>`;
      slot.appendChild(moreWrap);
    }
  } else {
    // バンドルが無ければ product-summary 部は非表示
    slot.remove();
  }

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

  row.innerHTML =
    `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込み中…</h4></div></div></article>`;

  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (Number.isFinite(priceMax)) qs.set("priceMax", String(priceMax));
  qs.set("limit", String(limit));

  try {
    const data = await apiJSON(`/api/shops-recent?${qs.toString()}`);
    row.innerHTML = "";

    const items = (data.items || []).slice(0, limit);
    if (!items.length) {
      row.innerHTML =
        `<article class="shop-card"><div class="body"><div class="title-line"><h4>新着がありません</h4></div></div></article>`;
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
    row.innerHTML =
      `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込みに失敗しました</h4></div></div></article>`;
  }
}
