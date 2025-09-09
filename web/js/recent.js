// web/js/recent.js
import { apiJSON } from "./http.js";

// "10:00–18:00" / "10:00-18:00" / "10:00〜18:00" に対応
function minutesUntilEnd(slot) {
  if (!slot) return Infinity;
  const m = String(slot).match(
    /(\d{1,2}):(\d{2})\s*[-–~〜]\s*(\d{1,2}):(\d{2})/
  );
  if (!m) return Infinity;
  const endH = +m[3],
    endMin = +m[4];
  const now = new Date();
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    endH,
    endMin,
    0,
    0
  );
  const diff = Math.floor((end - now) / 60000);
  return diff >= 0 ? diff : Infinity;
}

// 「終了間近」の閾値（分）
const SOON_MINUTES = 30;

// 既存の minutesUntilEnd(slot) をそのまま利用
function shouldShowSoon(slotLabel) {
  return minutesUntilEnd(slotLabel) <= SOON_MINUTES;
}

// .meta の中に <span class="soon"> を出し入れ
function upsertSoon(metaEl, slotLabel) {
  if (!metaEl) return;
  const show = shouldShowSoon(slotLabel);
  let tag = metaEl.querySelector(".soon");
  if (show) {
    if (!tag) {
      tag = document.createElement("span");
      tag.className = "soon";
      tag.textContent = "終了間近";
      metaEl.appendChild(tag);
    } else {
      tag.hidden = false;
    }
  } else {
    tag?.remove();
  }
}

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
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 1) : [];
  // ▼ これで置き換え（nearby.js / recent.js 共通）
  const fill = (summaryEl, b, s) => {
    const safe = (v) => (v == null ? "" : String(v));
    const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");

    // 画像
    const pImg = summaryEl.querySelector(".product-img");
    if (pImg) {
      pImg.src = b.thumb_url || s.photo_url || "./photo/noimg.jpg";
      pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
    }

    // タイトル
    const pName = summaryEl.querySelector(".product-name");
    if (pName) pName.textContent = b.title ?? "おすすめセット";

    // 時間帯 + あと◯分
    const timeEl = summaryEl.querySelector(".product-meta .time");
    const etaEl = summaryEl.querySelector(".product-meta .eta");
    const slot = b.slot || b.slot_label || "";
    if (timeEl) timeEl.textContent = slot ? `🕒 ${slot}` : "";
    if (etaEl) {
      const mins = minutesUntilEnd(slot);
      if (Number.isFinite(mins) && mins < 180) {
        // 3時間以内だけ出す
        etaEl.textContent = `あと${mins}分`;
        etaEl.hidden = false;
        etaEl.classList.toggle("eta--soon", mins <= 30); // 30分以下で警告色
      } else {
        etaEl.hidden = true;
        etaEl.classList.remove("eta--soon");
      }
    }

    // 在庫（バンドル優先→無ければ店舗合算）
    const stockEl = summaryEl.querySelector(".ps-aside .stock-inline");
    if (stockEl) {
      const remain = Number.isFinite(+b.qty_available)
        ? +b.qty_available
        : Number.isFinite(+s.stock_remain)
        ? +s.stock_remain
        : null;
      if (Number.isFinite(remain) && remain > 0) {
        stockEl.textContent = `残り${remain}個`;
        stockEl.classList.add("show");
        stockEl.hidden = false;
      } else {
        stockEl.classList.remove("show");
        stockEl.hidden = true;
      }
    }

    // 価格（バンドル price > price_min > 店の min_price）
    const priceEl = summaryEl.querySelector(".ps-aside .price-inline");
    if (priceEl) {
      const pv = Number.isFinite(+b.price)
        ? +b.price
        : Number.isFinite(+b.price_min)
        ? +b.price_min
        : Number.isFinite(+s.min_price)
        ? +s.min_price
        : null;
      if (pv != null) {
        priceEl.textContent = yen(pv);
        priceEl.classList.add("show");
        priceEl.hidden = false;
      } else {
        priceEl.classList.remove("show");
        priceEl.hidden = true;
      }
    }
    const eta = summaryEl.querySelector(".eta");
    if (eta) {
      const mins = minutesUntilEnd(b.slot);
      const isSoon = mins <= 30; // 30分を閾値に
      if (isSoon) {
        const w = Math.round(16 + ((30 - mins) / 30) * 28); // 16〜44pxで伸縮
        eta.style.width = `${w}px`;
        eta.classList.add("show");
        eta.hidden = false;
      } else {
        eta.classList.remove("show");
        eta.hidden = true;
        eta.removeAttribute("style");
      }
    }
  };

  if (!bundles.length) {
    if (shopInfo) shopInfo.remove();
  } else {
    fill(firstSummary, bundles[0], s);
    if (bundles[1]) {
      const second = firstSummary.cloneNode(true);
      fill(second, bundles[1], s);
      shopInfo.appendChild(second);
    }
    const total = Array.isArray(s.bundles) ? s.bundles.length : 0;
    if (total > 1 && shopInfo) {
      const moreWrap = document.createElement("div");
      moreWrap.className = "more-wrap";
      const chip = document.createElement("span");
      chip.className = "more-bundles";
      chip.textContent = `他 ${total - 1} セット`;
      moreWrap.appendChild(chip);
      shopInfo.appendChild(moreWrap);
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
