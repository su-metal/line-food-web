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
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  if (!tpl) {
    const a = document.createElement("article");
    a.className = "shop-card";
    a.textContent = safe(s.name || "店舗");
    return a;
  }

  const el = tpl.content.firstElementChild.cloneNode(true);

  // --- お気に入り ---
  const favBtn = el.querySelector(".fav-btn, .heart");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // --- 画像 ---
  const imgEl = el.querySelector(".thumb img, .avatar img");
  if (imgEl) {
    imgEl.src = s.photo_url || NOIMG;
    imgEl.alt = safe(s.name || "店舗画像");
    imgEl.onerror = () => {
      imgEl.onerror = null;
      imgEl.src = NOIMG;
    };
  }

  // --- タイトル / カテゴリ / 住所（recent は距離なし）---
  const titleEl = el.querySelector(".thumb-title, .title, .shop-title, h4");
  if (titleEl) titleEl.textContent = safe(s.name || "");

  const catEl = el.querySelector(".thumb-subline .point, .point, .category");
  if (catEl) catEl.textContent = safe(s.category || "");

  const distEl = el.querySelector(".thumb-subline .status, .status");
  if (distEl) distEl.textContent = ""; // recent は距離を出さない

  const placeEl = el.querySelector(".thumb-subline .place, .place, .address");
  if (placeEl) placeEl.textContent = safe(s.address || "");

  // --- 商品概要（bundles 最大2件。moreは作らない） ---
  const info = el.querySelector(".shop-info");
  const row1 = info?.querySelector(".product-summary");
  const bundles = Array.isArray(s.bundles) ? s.bundles : [];

  const fillRow = (rowEl, b) => {
    const pImg = rowEl.querySelector(".product-img");
    if (pImg) {
      pImg.src = (b && b.thumb_url) || s.photo_url || NOIMG;
      pImg.alt = `${safe(titleOf(b) || "セット")} の画像`;
      pImg.onerror = () => {
        pImg.onerror = null;
        pImg.src = NOIMG;
      };
    }
    const pName = rowEl.querySelector(".product-name");
    if (pName) pName.textContent = safe(titleOf(b) || "セット");

    const timeEl = rowEl.querySelector(".time");
    const slotLabel = slotOf(b);
    if (timeEl) timeEl.textContent = slotLabel ? `🕒 ${slotLabel}` : "";

    const priceEl = rowEl.querySelector(".price-inline");
    const pv = priceOf(b, s);
    if (priceEl) {
      if (pv != null && Number.isFinite(Number(pv))) {
        priceEl.textContent = yen(pv);
        priceEl.hidden = false;
        priceEl.classList.add("show");
      } else {
        priceEl.textContent = "";
        priceEl.hidden = true;
        priceEl.classList.remove("show");
      }
    }

    const stockEl = rowEl.querySelector(".stock-inline");
    const sv = stockOf(b, s);
    if (stockEl) {
      if (sv != null && Number(sv) > 0) {
        stockEl.textContent = `残り${Number(sv)}個`;
        stockEl.hidden = false;
        stockEl.classList.add("show");
      } else {
        stockEl.textContent = "";
        stockEl.hidden = true;
        stockEl.classList.remove("show");
      }
    }
  };

  if (!info || !row1 || bundles.length === 0) {
    info?.remove();
  } else {
    fillRow(row1, bundles[0]);
    if (bundles[1]) {
      const row2 = row1.cloneNode(true);
      row2.querySelectorAll(".stock-inline,.price-inline").forEach((e) => {
        e.hidden = true;
        e.classList.remove("show");
        e.textContent = "";
      });
      fillRow(row2, bundles[1]);
      info.appendChild(row2);
    }
    info.querySelector(".more-wrap")?.remove();
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
