// web/js/recent.js
import { apiJSON } from "./http.js";

// --- 終了間近（SOON）ヘルパー -------------------------------
const SOON_MINUTES = 30;

function minutesUntilEnd(slot) {
  if (!slot) return Infinity;
  const m = String(slot).match(
    /(\d{1,2}):(\d{2})\s*[-–~〜]\s*(\d{1,2}):(\d{2})/
  );
  if (!m) return Infinity;
  const endH = Number(m[3]),
    endMin = Number(m[4]);
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

// --- client-side distance fallback (haversine) ---
function calcDistanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371000; // m
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function shouldShowSoon(slotLabel) {
  return minutesUntilEnd(slotLabel) <= SOON_MINUTES;
}

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
  const el = tpl
    ? tpl.content.firstElementChild.cloneNode(true)
    : document.createElement("article");
  if (!tpl) el.className = "shop-card card-v3";

  // --- ヘッダ（店名・チップ・お気に入り） ---
  const name = safe(s.name || "");
  const titleNode = el.querySelector(".store-name, .thumb-title, h4");
  if (titleNode) titleNode.textContent = name;

  // --- 背景写真（ショップ写真 or 最初のバンドル画像を利用） ---
  const head = el.querySelector(".card-head");
  if (head) {
    const bg =
      s.photo_url ||
      (Array.isArray(s.bundles) && s.bundles[0]?.thumb_url) ||
      "";
    if (bg) {
      head.style.setProperty("--head-bg", `url("${bg}")`);
      head.classList.add("has-photo");
    } else {
      head.style.removeProperty("--head-bg");
      head.classList.remove("has-photo");
    }
  }

  const avatar = el.querySelector(".avatar");
  if (avatar && !avatar.querySelector("img")) {
    avatar.textContent = name.trim()[0] || "S";
  }

  el.querySelector(".point, .chip.cat, .category")?.replaceChildren(
    document.createTextNode(safe(s.category || ""))
  );
  el.querySelector(".status, .chip.distance")?.replaceChildren(
    document.createTextNode(fmtDistance(s.distance_m))
  );
  el.querySelector(".place, .chip.place, .address")?.replaceChildren(
    document.createTextNode(safe(s.address || ""))
  );

  const favBtn = el.querySelector(".fav-btn, .heart");
  if (favBtn) favBtn.dataset.shopId = safe(s.id);

  // --- 本文（商品 最大2件） ---
  const body = el.querySelector(".card-body");
  if (body) body.innerHTML = ""; // ダミーを必ず空にする

  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  const makeRow = () => {
    const row = document.createElement("div");
    row.className = "product-summary";
    row.innerHTML = `
      <img class="product-img" alt="">
      <div class="product-main">
        <div class="product-name"></div>
        <div class="product-meta">
          <span class="time"></span>
          <span class="eta" hidden></span>
          <span class="soon" hidden></span>
        </div>
      </div>
      <div class="ps-aside">
        <span class="stock-inline" hidden></span>
        <span class="price-inline" hidden></span>
      </div>`;
    return row;
  };

  const FallbackImg = "./img/noimg.svg";

  const setRow = (rowEl, b) => {
    // 画像
    const img = rowEl.querySelector(".product-img");
    if (img) {
      img.src = b?.thumb_url || s.photo_url || FallbackImg;
      img.alt = `${safe(b?.title ?? b?.name ?? "おすすめセット")} の画像`;
    }

    // タイトル
    const nameEl = rowEl.querySelector(".product-name");
    if (nameEl) {
      nameEl.textContent = safe(
        b?.title ?? b?.name ?? b?.bundle_title ?? "おすすめセット"
      );
    }

    // 時間
    const slotLabel = b?.slot_label || b?.slot || b?.time || "";
    const t = rowEl.querySelector(".time");
    if (t) t.textContent = slotLabel ? `🕒 ${slotLabel}` : "";
    const meta = rowEl.querySelector(".product-meta, .meta");
    upsertSoon(meta, slotLabel);

    // 終了間近
    const soon = rowEl.querySelector(".soon");

    // 価格（bundle優先）
    const priceVal = [b?.price_min, b?.price]
      .map(Number)
      .find((v) => Number.isFinite(v));
    const priceEl = rowEl.querySelector(".price-inline");
    if (priceEl) {
      if (Number.isFinite(priceVal)) {
        priceEl.textContent = "¥" + Number(priceVal).toLocaleString("ja-JP");
        priceEl.hidden = false;
        priceEl.classList.add("show");
      } else {
        priceEl.hidden = true;
        priceEl.classList.remove("show");
      }
    }

    // 在庫（bundle優先）
    const remain = [b?.qty_available, b?.stock, s?.stock_remain]
      .map((v) => Number(v))
      .find((v) => Number.isFinite(v));
    const stockEl = rowEl.querySelector(".stock-inline");
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
  };

  if (body && bundles.length) {
    const r1 = makeRow();
    setRow(r1, bundles[0]);
    body.appendChild(r1);
    if (bundles[1]) {
      const r2 = makeRow();
      setRow(r2, bundles[1]);
      body.appendChild(r2);
    }

    const remain = (s.bundles?.length || 0) - bundles.length;
    if (remain > 0) {
      const wrap = document.createElement("div");
      wrap.className = "more-wrap";
      wrap.innerHTML = `<button class="more-bundles">他 ${remain} セット</button>`;
      body.appendChild(wrap);
    }
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

  // ① 現在地を（可能なら）取得
  let lat, lng;
  try {
    const pos = await new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error("no_geolocation"));
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 60000,
      });
    });
    lat = pos.coords.latitude;
    lng = pos.coords.longitude;
  } catch {
    // 取れなくても続行（距離は後で補完 or 空表示）
  }

  // ② クエリを組み立て（lat/lng が取れていれば付与）
  const qs = new URLSearchParams();
  if (category) qs.set("category", category);
  if (Number.isFinite(priceMax)) qs.set("priceMax", String(priceMax));
  qs.set("limit", String(limit));
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    qs.set("lat", String(lat));
    qs.set("lng", String(lng));
  }

  try {
    const data = await apiJSON(`/api/shops-recent?${qs.toString()}`);
    row.innerHTML = "";

    // ③ APIが distance_m を返さない場合のフォールバック計算
    const items = (data.items || []).slice(0, limit).map((it) => {
      if (
        !Number.isFinite(it.distance_m) &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Number.isFinite(it.lat) &&
        Number.isFinite(it.lng)
      ) {
        it.distance_m = calcDistanceMeters(lat, lng, it.lat, it.lng);
      }
      return it;
    });

    if (!items.length) {
      row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>新着がありません</h4></div></div></article>`;
      return;
    }

    for (const s of items) row.appendChild(createCard(s));

    // お気に入り初期化
    try {
      const fav = await import("./fav.js");
      fav.initAllFavButtons?.();
    } catch {}
  } catch (e) {
    console.warn("[recent] failed", e?.status, e?.body || e);
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込みに失敗しました</h4></div></div></article>`;
  }
}
