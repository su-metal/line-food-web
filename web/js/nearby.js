// web/js/nearby.js  ← フロント用（ブラウザで実行）
import { apiJSON } from "./http.js";

function fmtDistance(m) {
  if (!Number.isFinite(m)) return "";
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function createCard(s) {
  const tpl = document.getElementById("shop-card-template");
  const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");
  const safe = (v) => (v == null ? "" : String(v));

  // テンプレートが無い場合の保護
  if (!tpl) {
    console.warn("[nearby] #shop-card-template not found");
    const fallback = document.createElement("article");
    fallback.className = "shop-card";
    fallback.textContent = safe(s.name || "店舗");
    return fallback;
  }

  const el = tpl.content.firstElementChild.cloneNode(true);

  // 画像・価格ピル・在庫ピル
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

  const stockPill = el.querySelector(".thumb .stock");
  if (stockPill) {
    if (Number.isFinite(s.stock_remain) && s.stock_remain > 0) {
      stockPill.textContent = `残り${s.stock_remain}個`;
      stockPill.hidden = false;
    } else {
      stockPill.hidden = true; // nearby は NEW 表示なし
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
  if (status) status.textContent = fmtDistance(s.distance_m);
  if (place) place.textContent = safe(s.address);

  // ▼ 商品概要（bundles 最大2件）。無ければ非表示。
  const shopInfo = el.querySelector(".shop-info");
  const firstSummary = el.querySelector(".shop-info .product-summary");
  const bundles = Array.isArray(s.bundles) ? s.bundles.slice(0, 2) : [];

  if (!bundles.length) {
    // bundles がまだ来ていないならブロックごと隠す
    if (shopInfo) shopInfo.remove();
  } else {
    // 1件目を上書き
    const fill = (summaryEl, b) => {
      const pImg = summaryEl.querySelector(".product-img");
      if (pImg) {
        pImg.src = b.thumb_url || s.photo_url || "./photo/noimg.jpg";
        pImg.alt = `${safe(b.title ?? "おすすめセット")} の画像`;
      }
      const pName = summaryEl.querySelector(".product-name");
      if (pName) pName.textContent = b.title ?? "おすすめセット";

      const rating = summaryEl.querySelector(".meta .rating");
      if (rating) rating.textContent = "—"; // 評価データ未提供のためダッシュ

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

    // 2件目があれば複製して追加
    if (bundles[1]) {
      const second = firstSummary.cloneNode(true);
      fill(second, bundles[1]);
      shopInfo.appendChild(second);
    }
  }

  return el;
}

export async function loadNearby({
  category = null,
  priceMax = null,
  radius = 3000,
} = {}) {
  const TARGET = 6;
  const row = document.getElementById("nearby-row");
  if (!row) return;
  row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>読み込み中…</h4></div></div></article>`;

  // geolocation
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
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>現在地が取得できませんでした</h4></div></div></article>`;
    return;
  }

  const radii = [radius, 5000, 8000, 12000, 20000];
  const seen = new Set();
  let pool = [];
  for (const r of radii) {
    const qs = new URLSearchParams({
      lat,
      lng,
      radius: String(r),
      limit: String(TARGET),
    });
    if (category) qs.set("category", category);
    if (Number.isFinite(priceMax)) qs.set("priceMax", String(priceMax));
    try {
      const data = await apiJSON(`/api/nearby?${qs.toString()}`);
      for (const it of data.items || []) {
        if (seen.has(it.id)) continue;
        seen.add(it.id);
        pool.push(it);
      }
      pool.sort((a, b) => a.distance_m - b.distance_m);
      if (pool.length >= TARGET) {
        pool = pool.slice(0, TARGET);
        break;
      }
    } catch (e) {
      console.warn("[nearby] fetch failed @", r, e.status, e.body || e);
    }
  }

  row.innerHTML = "";
  if (!pool.length) {
    row.innerHTML = `<article class="shop-card"><div class="body"><div class="title-line"><h4>近くにお店が見つかりません</h4></div></div></article>`;
    return;
  }
  for (const s of pool.slice(0, TARGET)) row.appendChild(createCard(s));

  try {
    const fav = await import("./fav.js");
    fav.initAllFavButtons?.();
  } catch {}
}
