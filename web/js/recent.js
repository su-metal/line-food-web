// web/js/recent.js
import { apiJSON } from "./http.js";

// 既存の createCard(s) をこの版で置き換え
function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
  const safe = (v) => (v == null ? "" : String(v));

  if (!tpl) {
    const fallback = document.createElement("article");
    fallback.className = "shop-card";
    fallback.textContent = safe(s.name || "店舗");
    return fallback;
  }

  const el = tpl.content.firstElementChild.cloneNode(true);

  // 画像
  const thumbImg = el.querySelector(".thumb img");
  if (thumbImg) {
    thumbImg.src = s.photo_url || "./photo/noimg.jpg";
    thumbImg.alt = safe(s.name);
  }

  // お気に入り
  const favBtn = el.querySelector(".thumb .heart.fav-btn");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // ★ オーバーレイ内のテキスト
  el.querySelector(".thumb-info .thumb-title").textContent = safe(s.name);
  const point = el.querySelector(".thumb-info .point");
  const status = el.querySelector(".thumb-info .status");
  const place = el.querySelector(".thumb-info .place");
  if (point) point.textContent = safe(s.category);
  if (status) status.textContent = ""; // recentは距離なし
  if (place) place.textContent = safe(s.address);

  // ▼ 商品概要（bundles 最大2件）
  const shopInfo = el.querySelector(".shop-info");
  const firstSummary = el.querySelector(".shop-info .product-summary");
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];
  const fill = (summaryEl, b) => {
    const pImg = summaryEl.querySelector(".product-img");
    if (pImg) {
      pImg.src = b.thumb_url || s.photo_url || "./photo/noimg.jpg";
      pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
    }
    const pName = summaryEl.querySelector(".product-name");
    if (pName) pName.textContent = b.title ?? "おすすめセット";
    const time = summaryEl.querySelector(".meta .time");
    if (time) time.textContent = b.slot ? `🕒 ${b.slot}` : "";

    // 右端：価格（bundleの価格のみ／チルダ無し）
    const priceInline = summaryEl.querySelector(".price-inline");
    if (priceInline) {
      const pv = Number(b?.price_min);
      if (Number.isFinite(pv)) {
        priceInline.textContent = "¥" + pv.toLocaleString("ja-JP");
        priceInline.hidden = false;
      } else {
        priceInline.hidden = true;
      }
    }
    // 在庫ピル（右端）：bundle の残数を表示
    const stockInline = summaryEl.querySelector(".stock-inline");
    if (stockInline) {
      const remain = Number(b?.qty_available);
      if (Number.isFinite(remain) && remain > 0) {
        stockInline.textContent = `残り${remain}個`;
        stockInline.hidden = false;
      } else {
        stockInline.hidden = true;
      }
    }
  };
  if (!bundles.length) {
    if (shopInfo) shopInfo.remove();
  } else {
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
