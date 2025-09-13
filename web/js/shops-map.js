// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ===== Utils ===== */
const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");
const km  = (m) => (Number.isFinite(m) ? (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`) : "");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const debounce = (fn, ms=250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

function pickLatLng(obj) {
  const lat = num(obj?.lat) ?? num(obj?.latitude) ?? num(obj?.lat_deg) ??
              num(obj?.location?.lat) ?? num(obj?.coords?.lat) ?? num(obj?.geo?.lat);
  const lng = num(obj?.lng) ?? num(obj?.lon) ?? num(obj?.longitude) ?? num(obj?.lng_deg) ??
              num(obj?.location?.lng) ?? num(obj?.location?.lon) ??
              num(obj?.coords?.lng) ?? num(obj?.geo?.lng);
  return [lat, lng];
}

/* ===== Bottom sheet ===== */
function fillMapCard(shop = {}) {
  const card = document.getElementById("map-card");
  if (!card) return;
  const title = document.getElementById("mc-title");
  const note  = document.getElementById("mc-note");
  const meta  = document.getElementById("mc-meta");
  const img   = document.getElementById("mc-img");
  const link  = document.getElementById("mc-link");

  title.textContent = shop.name || "店舗";
  img.src = shop.photo_url || shop.thumb_url || NOIMG;
  img.alt = shop.name || "店舗";

  const cat  = shop.category_name || shop.category || shop.tags?.[0] || shop.genres?.[0] || "カテゴリ";
  const dist = km(shop.distance_m);
  const b0   = Array.isArray(shop.bundles) ? shop.bundles[0] : null;
  const time = b0?.slot_label || b0?.slot || b0?.time ||
               (shop.start && shop.end ? `${shop.start}–${shop.end}` : "");
  meta.innerHTML = `
    <span class="chip chip--brand">${cat}</span>
    ${dist ? `<span class="chip">${dist}</span>` : ""}
    ${time ? `<span class="chip">🕒 ${time}</span>` : ""}
  `;

  if (Array.isArray(shop.bundles) && shop.bundles.length) {
    const pVals = [shop.bundles[0]?.price_min, shop.bundles[0]?.price, shop.min_price]
      .map(Number).filter(Number.isFinite);
    const minP = pVals.length ? Math.min(...pVals) : null;
    note.textContent = minP != null ? `最安 ${yen(minP)} から` : "販売中のセットがあります";
  } else {
    note.textContent = "現在のレスキュー依頼はありません。";
  }
  link.href = `/shop.html?id=${encodeURIComponent(shop.id)}`;
  card.hidden = false;
  card.classList.add("is-open");
}
document.getElementById("mc-close")?.addEventListener("click", () => {
  const card = document.getElementById("map-card");
  if (card) { card.classList.remove("is-open"); card.hidden = true; }
});

/* ===== Cache (optimistic) ===== */
const LS_LAST_CENTER = "map:lastCenter";     // {lat,lng,ts}
const SS_LAST_ITEMS  = "map:lastItems";      // items[]

const getLastCenter = () => {
  try {
    const o = JSON.parse(localStorage.getItem(LS_LAST_CENTER) || "null");
    if (!o || !Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
    return [o.lat, o.lng];
  } catch { return null; }
};
const setLastCenter  = (lat,lng)=>{ try{localStorage.setItem(LS_LAST_CENTER,JSON.stringify({lat,lng,ts:Date.now()}));}catch{} };
const getCachedItems = () => { try{ const a=JSON.parse(sessionStorage.getItem(SS_LAST_ITEMS)||"[]"); return Array.isArray(a)?a:[]; }catch{return [];} };
const setCachedItems = (items)=>{ try{sessionStorage.setItem(SS_LAST_ITEMS,JSON.stringify(items||[]));}catch{} };

/* ===== Geocode/Suggest via same-origin proxy ===== */
async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
/** 検索語を1件ジオコード（駅・ランドマーク優先 /api/geo-proxy 経由） */
async function geocode(q) {
  if (!q) return null;
  const p = new URLSearchParams({ op: "search", q, limit: "1", countrycodes: "jp" });
  const data = await fetchJSON(`/api/geo-proxy?${p.toString()}`);
  const it = Array.isArray(data) ? data[0] : data;
  const lat = Number(it?.lat ?? it?.latitude), lng = Number(it?.lng ?? it?.lon ?? it?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, name: it?.name || it?.display_name } : null;
}
/** サジェスト配列を取得（駅・ランドマークのみ /api/geo-proxy 経由） */
async function suggest(q) {
  if (!q) return [];
  const p = new URLSearchParams({ op: "suggest", q, limit: "8", countrycodes: "jp" });
  const arr = await fetchJSON(`/api/geo-proxy?${p.toString()}`);
  if (!Array.isArray(arr)) return [];
  // 念のためクライアントでも軽くフィルタ
  const allow = new Set(["railway", "tourism", "amenity", "aeroway", "natural", "historic", "leisure", "place"]);
  return arr
    .map((it) => {
      const la = Number(it.lat ?? it.latitude), lo = Number(it.lon ?? it.lng ?? it.longitude);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
      const cls = it.class || it.category || "";
      if (!allow.has(cls)) return null;
      const nm  = it.name || it.display_name || "";
      const sub = it.sub || it.address?.city || it.address?.town || it.address?.state || "";
      const icon = it.icon || (cls==="railway"?"🚉":cls==="aeroway"?"🛫":cls==="tourism"?"📍":cls==="amenity"?"🏢":"🗺️");
      return { name: nm, sub, lat: la, lng: lo, icon };
    })
    .filter(Boolean)
    .slice(0, 8);
}

/* ===== Main ===== */
(async function initShopsMap() {
  try {
    // 地図コンテナ存在チェック
    if (!document.getElementById("map")) {
      console.warn("[shops-map] #map not found"); 
      return;
    }

    const mapAdp = createMapAdapter("leaflet");

    // URL param
    const params  = new URLSearchParams(location.search);
    const qParam  = (params.get("q") || "").trim();

    const searchInput = document.getElementById("q");
    const searchWrap  = searchInput?.closest(".map-search");

    let lastData = [];      // 直近描画した店舗配列（__lat/__lng 付き）
    const SEARCH_ZOOM = 16; // 検索確定時のクローズアップズーム

    // 1) まず地図を描画（前回中心 or 東京駅）
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // 2) キャッシュがあれば即マーカー（体感を速く）
    const cached = getCachedItems().map((it) => {
      const [la, lo] = pickLatLng(it);
      return Number.isFinite(la) && Number.isFinite(lo) ? { ...it, __lat: la, __lng: lo } : null;
    }).filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, { chunk: 80, delay: 8 });
      mapAdp.fitToMarkers({ padding: 56 });
      lastData = cached;
    }

    // 3) 共通：ある地点を基準に店舗を再読込
    //    options.focusOnly=true のときは “検索クローズアップ”（= マーカー全体にはフィットしない）
    const reloadAt = async (lat, lng, { focusOnly = false } = {}) => {
      setLastCenter(lat, lng);
      mapAdp.setCenter(lat, lng, focusOnly ? SEARCH_ZOOM : 15);
      mapAdp.setSearchMarker(lat, lng); // 検索地点のドットを1つだけ表示/更新

      // 近隣店舗の取得
      let items = [];
      try {
        const qs = new URLSearchParams({ lat:String(lat), lng:String(lng), radius:"3000", limit:"60" });
        const near = await apiJSON(`/api/nearby?${qs.toString()}`);
        items = Array.isArray(near?.items) ? near.items : [];
        if (!items.length) {
          const recent = await apiJSON(`/api/shops-recent?limit=30`);
          items = Array.isArray(recent?.items) ? recent.items : [];
        }
      } catch (e) { console.warn("[shops-map] list fetch failed", e); }

      const withCoords = items.map((it) => {
        const [la, lo] = pickLatLng(it);
        return Number.isFinite(la) && Number.isFinite(lo) ? { ...it, __lat: la, __lng: lo } : null;
      }).filter(Boolean);

      await mapAdp.setMarkers(withCoords, { chunk: 80, delay: 8 });
      lastData = withCoords;
      setCachedItems(items);

      if (!focusOnly && withCoords.length) {
        mapAdp.fitToMarkers({ padding: 56 });
      }
    };

    // 4) 初期：?q= があれば検索クローズアップ／無ければ現在地で通常描画
    if (qParam) {
      try {
        const hit = await geocode(qParam);
        if (hit) await reloadAt(hit.lat, hit.lng, { focusOnly: true });
      } catch (e) {
        console.warn("[shops-map] geocode failed", e);
      }
    } else {
      (async () => {
        try {
          const pos = await new Promise((res, rej) => {
            if (!navigator.geolocation) return rej(new Error("no_geolocation"));
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy:false, timeout:8000, maximumAge:60000
            });
          });
          await reloadAt(pos.coords.latitude, pos.coords.longitude);
          mapAdp.setCurrentDot(pos.coords.latitude, pos.coords.longitude); // 現在地ドット
        } catch { /* noop */ }
      })();
    }

    // 5) マーカー → カード
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    /* ====== サジェスト（駅・ランドマーク候補 + 確定時の挙動を強化） ====== */
    (() => {
      if (!searchInput || !searchWrap) return;

      let box = null, suggItems = [], suggIdx = -1;
      const ensureBox = () => {
        if (box) return box;
        box = document.createElement("div");
        box.className = "suggest-box";
        box.hidden = true;
        searchWrap.appendChild(box);
        return box;
      };
      const hideSuggest = () => {
        const el = ensureBox();
        el.hidden = true;
        el.innerHTML = "";
        suggItems = [];
        suggIdx = -1;
      };
      const renderSuggest = (list) => {
        const el = ensureBox();
        suggItems = Array.isArray(list) ? list : [];
        suggIdx = -1;
        if (!suggItems.length) { hideSuggest(); return; }
        el.innerHTML = `
          <ul class="suggest-list">
            ${suggItems.map((s,i)=>`
              <li class="sugg" data-i="${i}">
                <span class="ic">${s.icon || "📍"}</span>
                <span class="main">${s.name || s.display_name || ""}</span>
                ${s.sub ? `<span class="sub">${s.sub}</span>` : ""}
              </li>
            `).join("")}
          </ul>`;
        el.hidden = false;
        el.querySelectorAll(".sugg").forEach(li=>{
          li.addEventListener("click", () => chooseSuggest(Number(li.dataset.i)));
        });
      };
      const highlight = (delta) => {
        const el = ensureBox(); if (!el || el.hidden) return;
        const ns = [...el.querySelectorAll(".sugg")]; if (!ns.length) return;
        suggIdx = (suggIdx + delta + ns.length) % ns.length;
        ns.forEach((n,i)=>n.classList.toggle("is-active", i===suggIdx));
        ns[suggIdx]?.scrollIntoView?.({ block:"nearest" });
      };

      const commitQuery = async () => {
        const q = (searchInput.value || "").trim();
        if (!q) { hideSuggest(); return; }
        hideSuggest();
        try {
          const hit = await geocode(q);
          if (hit) await reloadAt(hit.lat, hit.lng, { focusOnly: true }); // クローズアップ
        } catch (e) { console.warn("[shops-map] geocode failed", e); }
      };

      const chooseSuggest = async (i) => {
        const s = suggItems[i];
        if (!s) return;
        searchInput.value = s.name || s.display_name || "";
        hideSuggest();
        const la = Number(s.lat), lo = Number(s.lng);
        if (Number.isFinite(la) && Number.isFinite(lo)) {
          await reloadAt(la, lo, { focusOnly: true });
        } else {
          await commitQuery();
        }
      };

      const fetchSuggest = async (q) => {
        if (!q) { hideSuggest(); return; }
        try { renderSuggest(await suggest(q)); }
        catch { renderSuggest([]); }
      };

      let t = 0;
      const runSuggest = () => {
        clearTimeout(t);
        const q = searchInput.value.trim();
        if (!q) { hideSuggest(); return; }
        t = setTimeout(()=>fetchSuggest(q), 200);
      };

      // 入力で候補
      searchInput.addEventListener("input", runSuggest, { passive: true });

      // Enter / 矢印
      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") { e.preventDefault(); highlight(+1); return; }
        if (e.key === "ArrowUp")   { e.preventDefault(); highlight(-1); return; }
        if (e.key === "Enter" && !e.isComposing) {
          e.preventDefault();
          if (suggIdx >= 0) chooseSuggest(suggIdx);
          else commitQuery();
        }
      });
      // Androidで keydown 捕まらない保険
      searchInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter" && !e.isComposing) commitQuery();
      });
      // type=search の search イベント（iOS Safari）
      searchInput.addEventListener("search", () => commitQuery());
      // 変換確定
      searchInput.addEventListener("compositionend", () => { hideSuggest(); });

      // 外クリックで閉じる
      document.addEventListener("click", (ev) => {
        if (!searchWrap.contains(ev.target)) hideSuggest();
      });

      // form 送信でも確定
      const form = searchInput.closest("form");
      if (form) {
        form.addEventListener("submit", (e) => { e.preventDefault(); commitQuery(); });
      }
    })();

    // 6) 現在地へ（現在地＋最寄り1件にフィット）
    document.getElementById("btnLocate")?.addEventListener("click", async () => {
      let me = center;
      try {
        const pos = await new Promise((res, rej) => {
          if (!navigator.geolocation) return rej(new Error("no_geolocation"));
          navigator.geolocation.getCurrentPosition(res, rej, {
            enableHighAccuracy: true, timeout: 8000, maximumAge: 0
          });
        });
        me = [pos.coords.latitude, pos.coords.longitude];
        setLastCenter(me[0], me[1]);
        mapAdp.setCurrentDot(me[0], me[1]);
      } catch { /* noop */ }

      // 最寄り計算
      let nearest = null, best = Infinity;
      const items = lastData || [];
      for (const it of items) {
        const dLat = (it.__lat - me[0]) * Math.PI / 180;
        const dLng = (it.__lng - me[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(me[0]*Math.PI/180)*Math.cos(it.__lat*Math.PI/180)*Math.sin(dLng/2)**2;
        const d = 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d < best) { best = d; nearest = it; }
      }
      // 現在地のみ or 現在地+最寄り にフィット
      if (nearest && window.L) {
        const b = window.L.latLngBounds([me, [nearest.__lat, nearest.__lng]]);
        if (b.isValid()) mapAdp.map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
      } else {
        mapAdp.setCenter(me[0], me[1], 15);
      }
    });

  } catch (e) {
    console.error("[shops-map] fatal", e);
  }
})();
