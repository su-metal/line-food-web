// web/js/recent.js
import { apiJSON } from "./http.js";

function isNew(created_at) {
  if (!created_at) return false;
  const seven = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(created_at).getTime() < seven;
}
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
  const safe = (v) => (v == null ? "" : String(v));

  if (!tpl) {
    console.warn("[recent] #shop-card-template not found");
    const fallback = document.createElement("article");
    fallback.className = "shop-card";
    fallback.textContent = safe(s.name || "店舗");
    return fallback;
  }

  const el = tpl.content.firstElementChild.cloneNode(true);

  // 画像・価格ピル
  const thumbImg = el.querySelector(".thumb img");
  if (thumbImg) {
    thumbImg.src = s.photo_url || "./photo/noimg.jpg";
    thumbImg.alt = safe(s.name);
  }

  const pricePill = el.querySelector(".thumb .price");
  if (pricePill) {
    if (Number.isFinite(Number(s.min_price))) {
      pricePill.textContent = yen(s.min_price) + "〜";
      pricePill.hidden = false;
    } else {
      pricePill.hidden = true;
    }
  }

  // 在庫 or NEW
  const stockPill = el.querySelector(".thumb .stock");
  if (stockPill) {
    if (Number.isFinite(s.stock_remain) && s.stock_remain > 0) {
      stockPill.textContent = `残り${s.stock_remain}個`;
      stockPill.hidden = false;
    } else if (isNew(s.created_at)) {
      stockPill.textContent = "NEW";
      stockPill.hidden = false;
    } else {
      stockPill.hidden = true;
    }
  }

  // タイトル・ハート
  el.querySelector(".title-line h4").textContent = safe(s.name);
  const favBtn = el.querySelector(".heart.fav-btn");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // サブライン
  const point = el.querySelector(".subline .point");
  const status = el.querySelector(".subline .status");
  const place = el.querySelector(".subline .place");
  if (point) point.textContent = safe(s.category);
  if (status) status.textContent = ""; // recent は距離なし
  if (place) place.textContent = safe(s.address);

  // ▼ 商品概要（bundles 最大2件）。無ければ非表示。
  const shopInfo = el.querySelector(".shop-info");
  const firstSummary = el.querySelector(".shop-info .product-summary");
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  if (!bundles.length) {
    if (shopInfo) shopInfo.remove();
  } else {
    const fill = (summaryEl, b) => {
      const pImg = summaryEl.querySelector(".product-img");
      if (pImg) {
        pImg.src = b.thumb_url || s.photo_url || "./photo/noimg.jpg";
        pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
      }
      const pName = summaryEl.querySelector(".product-name");
      if (pName) pName.textContent = b.title ?? "おすすめセット";

      const rating = summaryEl.querySelector(".meta .rating");
      if (rating) rating.textContent = "—";

      const time = summaryEl.querySelector(".meta .time");
      if (time) time.textContent = b.slot ? `🕒 ${b.slot}` : "";

      const price = summaryEl.querySelector(".meta .price");
      if (price) {
        if (Number.isFinite(Number(b.price_min))) {
          price.textContent = yen(b.price_min) + "〜";
        } else if (Number.isFinite(Number(s.min_price))) {
          price.textContent = yen(s.min_price) + "〜";
        } else {
          price.textContent = "";
        }
      }
    };

    fill(firstSummary, bundles[0]);
    if (bundles[1]) {
      const second = firstSummary.cloneNode(true);
      fill(second, bundles[1]);
      shopInfo.appendChild(second);
    }
  }

  return el;
}

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
    // お気に入りボタンの初期化
    try {
      const fav = await import("./fav.js");
      fav.initAllFavButtons?.();
    } catch {}
  } catch (e) {
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込みに失敗しました</h4></div></div></article>`;
    console.warn("[recent] failed", e.status, e.body || e);
  }
}
