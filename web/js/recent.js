// web/js/recent.js
import { apiJSON } from "./http.js";

function isNew(created_at) {
  if (!created_at) return false;
  const seven = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(created_at).getTime() < seven;
}
function createCard(s) {
  const el = document.createElement("article");
  const yen = (v) => "¥" + Number(v).toLocaleString("ja-JP");

  el.className = "shop-card";
  el.innerHTML = `
    <div class="thumb">
      <img src="${s.photo_url || "./photo/noimg.jpg"}" alt="${s.name ?? ""}" />
      ${
        Number.isFinite(Number(s.min_price))
          ? `<span class="price">${yen(s.min_price)}〜</span>`
          : ""
      }
      ${
        Number.isFinite(s.stock_remain) && s.stock_remain > 0
          ? `<span class="stock">残り${s.stock_remain}個</span>`
          : isNew(s.created_at)
          ? `<span class="stock">NEW</span>`
          : ""
      }
    </div>
    <div class="body">
      <div class="title-line">
        <h4>${s.name ?? ""}</h4>
        <button class="heart fav-btn" data-shop-id="${
          s.id
        }" aria-pressed="false" aria-label="お気に入りを切り替え">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21s-6.7-4.2-9.2-8C1.2 10 2.1 7.2 4.6 6c1.9-1 4.3-.5 5.6 1.2C11.5 5.5 13.9 5 15.8 6c2.5 1.2 3.4 4 1.8 7-2.5 3.8-9.6 8-9.6 8Z"
              fill="none" stroke="currentColor" stroke-width="1.8"/>
          </svg>
        </button>
      </div>
      <div class="subline">
        <span class="point">${s.category ?? ""}</span>
        <span class="status"></span>
      </div>
      <div class="meta"><span class="address">${s.address ?? ""}</span></div>
    </div>`;
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
