// web/js/shops-map.js  ← 全文置き換え
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ========== Utils ========== */
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

/* ========== Cache ========== */
const LS_LAST_CENTER = "map:lastCenter";     // {lat,lng,ts}
const SS_LAST_ITEMS  = "map:lastItems";      // items[]

const getLastCenter = () => {
  try { const o = JSON.parse(localStorage.getItem(LS_LAST_CENTER) || "null");
    if (!o || !Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
    return [o.lat, o.lng];
  } catch { return null; }
};
const setLastCenter  = (lat,lng)=>{ try{localStorage.setItem(LS_LAST_CENTER,JSON.stringify({lat,lng,ts:Date.now()}));}catch{} };
const getCachedItems = () => { try{ const a=JSON.parse(sessionStorage.getItem(SS_LAST_ITEMS)||"[]"); return Array.isArray(a)?a:[]; }catch{return [];} };
const setCachedItems = (items)=>{ try{sessionStorage.setItem(SS_LAST_ITEMS,JSON.stringify(items||[]));}catch{} };

/* ========== Geo (via same-origin proxy) ========== */
const GEO_BASE = "/api/geo-proxy";

// 低頻度のローカル候補（429時の保険）
const LOCAL_FALLBACK = [
  { name: "東京駅",   sub:"千代田区", lat:35.681236, lng:139.767125, icon:"🚉" },
  { name: "新宿駅",   sub:"新宿区",   lat:35.690921, lng:139.700257, icon:"🚉" },
  { name: "渋谷駅",   sub:"渋谷区",   lat:35.658034, lng:139.701636, icon:"🚉" },
  { name: "横浜駅",   sub:"西区",     lat:35.46583,  lng:139.622,    icon:"🚉" },
  { name: "名古屋駅", sub:"中村区",   lat:35.170694, lng:136.881637, icon:"🚉" },
  { name: "大阪駅",   sub:"北区",     lat:34.702485, lng:135.495951, icon:"🚉" },
];

async function geocode(q) {
  if (!q) return null;
  try {
    const res = await apiJSON(`${GEO_BASE}?op=search&limit=1&countrycodes=jp&q=${encodeURIComponent(q)}`);
    // 仕様: { hit: {name, sub, lat, lng, icon} } or { hit: null }
    return res?.hit || null;
  } catch (e) {
    console.warn("[geo] search failed:", e?.status || e?.message || e);
    // 429/失敗時はローカル候補の前方一致で代替
    const hit = LOCAL_FALLBACK.find(x => x.name.includes(q));
    return hit || null;
  }
}

async function suggest(q) {
  const s = (q || "").trim();
  if (s.length < 2) return []; // 1文字の叩きすぎを抑制
  try {
    const res = await apiJSON(`${GEO_BASE}?op=suggest&limit=8&countrycodes=jp&q=${encodeURIComponent(s)}`);
    // 仕様: { items: [{name, sub, lat, lng, icon}, ...] }
    return Array.isArray(res?.items) ? res.items : [];
  } catch (e) {
    console.warn("[geo] suggest failed:", e?.status || e?.message || e);
    // 429/失敗時はローカル候補を簡易フィルタ
    return LOCAL_FALLBACK.filter(x => x.name.includes(s)).slice(0, 8);
  }
}

/* ========== Search UI (Enter/タップ完全対応 & 429耐性) ========== */
function wireSearchUI() {
  const input = document.getElementById("q");
  const wrap  = input?.closest(".map-search");
  if (!input || !wrap) return;

  input.setAttribute("enterkeyhint", "search");
  input.setAttribute("inputmode", "search");
  input.setAttribute("autocomplete", "off");

  let box = null, suggItems = [], suggIdx = -1;
  let composing = false;
  let pendingEnterWhileComposing = false;

  const ensureBox = () => {
    if (box) return box;
    box = document.createElement("div");
    box.className = "suggest-box";
    box.hidden = true;
    wrap.appendChild(box);
    return box;
  };
  const hideSuggest = () => {
    const el = ensureBox();
    el.hidden = true;
    el.innerHTML = "";
    suggItems = []; suggIdx = -1;
  };
  const renderSuggest = (list=[]) => {
    const el = ensureBox();
    suggItems = Array.isArray(list) ? list : [];
    suggIdx = -1;
    if (!suggItems.length) { hideSuggest(); return; }
    el.innerHTML = `
      <ul class="suggest-list">
        ${suggItems.map((s,i)=>`
          <li class="sugg" data-i="${i}">
            <span class="ic">${s.icon || "📍"}</span>
            <span class="main">${s.name || ""}</span>
            ${s.sub ? `<span class="sub">${s.sub}</span>` : ""}
          </li>
        `).join("")}
      </ul>`;
    el.hidden = false;
    el.querySelectorAll(".sugg").forEach(li=>{
      li.addEventListener("click", () => chooseSuggest(Number(li.dataset.i)));
    });
  };

  // 地図側へ渡す（先にスタブ→init後に本物に差し替え）
  const goTo = (lat, lng, label, opts) => {
    if (window.__mapGoTo) {
      window.__mapGoTo(lat, lng, label, opts);
    } else {
      window.__pendingMapGoTo = { lat, lng, label, opts };
    }
  };

  // Enter時、短時間の連打を1発に抑制
  let lastEnterAt = 0, enterTimer = null;
  const MIN_ENTER_MS = 650;

  const commitQuery = async () => {
    const q = (input.value || "").trim();
    hideSuggest();
    if (!q) return;

    const now = Date.now();
    const wait = Math.max(0, MIN_ENTER_MS - (now - lastEnterAt));
    if (wait > 0) {
      clearTimeout(enterTimer);
      enterTimer = setTimeout(commitQuery, wait);
      return;
    }
    lastEnterAt = now;

    const hit = await geocode(q);
    if (hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng)) {
      goTo(hit.lat, hit.lng, hit.name || q, { focusOnly: true });
    }
  };

  const chooseSuggest = async (i) => {
    const s = suggItems[i];
    if (!s) return;
    input.value = s.name || "";
    hideSuggest();
    if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) {
      goTo(s.lat, s.lng, s.name, { focusOnly: true });
    } else {
      commitQuery();
    }
  };

  const runSuggest = debounce(async () => {
    const q = input.value.trim();
    if (!q) { hideSuggest(); return; }
    const list = await suggest(q);
    renderSuggest(list);
  }, 350);

  // 入力→候補
  input.addEventListener("input", runSuggest, { passive: true });

  // IME
  input.addEventListener("compositionstart", () => { composing = true; });
  input.addEventListener("compositionend", () => {
    composing = false;
    if (pendingEnterWhileComposing) {
      pendingEnterWhileComposing = false;
      commitQuery();
    }
  });

  // Enter 決定（keydownで最優先）
  const handleEnterNow = (e) => {
    if (e?.cancelable) e.preventDefault();
    if (suggIdx >= 0) chooseSuggest(suggIdx);
    else commitQuery();
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); highlight(+1); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); highlight(-1); return; }
    if (e.key === "Enter") {
      if (composing || e.isComposing) {
        pendingEnterWhileComposing = true;
      } else {
        handleEnterNow(e);
      }
    }
  });
  input.addEventListener("keyup", (e) => {
    if (e.key === "Enter" && pendingEnterWhileComposing) {
      pendingEnterWhileComposing = false;
      handleEnterNow(e);
    }
  });
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !composing && !e.isComposing) handleEnterNow(e);
  });
  input.addEventListener("search", () => commitQuery()); // iOSの「検索」ボタン

  // 外クリックで閉じる
  document.addEventListener("click", (ev) => { if (!wrap.contains(ev.target)) hideSuggest(); });
  input.addEventListener("blur", () => setTimeout(hideSuggest, 120));

  // ↑↓ 選択
  const highlight = (delta) => {
    const el = ensureBox(); if (!el || el.hidden) return;
    const ns = [...el.querySelectorAll(".sugg")]; if (!ns.length) return;
    suggIdx = (suggIdx + delta + ns.length) % ns.length;
    ns.forEach((n,i)=>n.classList.toggle("is-active", i===suggIdx));
    ns[suggIdx]?.scrollIntoView?.({ block:"nearest" });
  };
}

/* ========== Bottom Sheet ========== */
function fillMapCard(shop = {}) {
  const card  = document.getElementById("map-card");
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

/* ========== Main ========== */
(async function initShopsMap() {
  // 先に検索UIを配線（地図の成否に依らない）
  wireSearchUI();

  // mapGoTo のスタブ（先に用意しておく）
  window.__pendingMapGoTo = null;
  window.__mapGoTo = (lat, lng, _label, opts) => {
    window.__pendingMapGoTo = { lat, lng, opts };
  };

  try {
    const mapAdp  = createMapAdapter("leaflet");
    const params  = new URLSearchParams(location.search);
    const qParam  = (params.get("q") || "").trim();
    const SEARCH_ZOOM = 16;

    // 1) 地図
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // 2) 検索ドット
    const showSearchDot = (lat, lng) => {
      setLastCenter(lat, lng);
      if (typeof mapAdp.setSearchMarker === "function") {
        mapAdp.setSearchMarker(lat, lng);
      } else if (window.L && mapAdp.map) {
        if (!window.__searchDot) {
          window.__searchDot = window.L.circleMarker([lat, lng], {
            radius: 7, color: "#2a6ef0", weight: 2, fillColor: "#2a6ef0", fillOpacity: 1
          }).addTo(mapAdp.layerOverlay || mapAdp.map);
        } else {
          window.__searchDot.setLatLng([lat, lng]);
        }
      }
    };

    // 3) キャッシュ描画
    let lastData = [];
    const cached = getCachedItems().map((it) => {
      const [la, lo] = pickLatLng(it);
      return Number.isFinite(la) && Number.isFinite(lo) ? { ...it, __lat: la, __lng: lo } : null;
    }).filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, { /* size/color はアダプタ既定 */ });
      mapAdp.fitToMarkers({ padding: 56 });
      lastData = cached;
    }

    // 4) 指定地点で店舗を再読込
    const reloadAt = async (lat, lng, { focusOnly = false } = {}) => {
      mapAdp.setCenter(lat, lng, focusOnly ? SEARCH_ZOOM : 15);
      showSearchDot(lat, lng);

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

      await mapAdp.setMarkers(withCoords);
      lastData = withCoords;
      setCachedItems(items);

      if (!focusOnly && withCoords.length) {
        mapAdp.fitToMarkers({ padding: 56 });
      }
    };

    // 5) mapGoTo を本物に差し替え & 保留分を消化
    window.__mapGoTo = (lat, lng, _label, opts) => reloadAt(lat, lng, opts || {});
    if (window.__pendingMapGoTo) {
      const p = window.__pendingMapGoTo;
      window.__pendingMapGoTo = null;
      window.__mapGoTo(p.lat, p.lng, "", p.opts || {});
    }

    // 6) 初期表示：?q=
    if (qParam) {
      const hit = await geocode(qParam);
      if (hit) await reloadAt(hit.lat, hit.lng, { focusOnly: true });
    } else {
      // 現在地
      (async () => {
        try {
          const pos = await new Promise((res, rej) => {
            if (!navigator.geolocation) return rej(new Error("no_geolocation"));
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy:false, timeout:8000, maximumAge:60000
            });
          });
          await reloadAt(pos.coords.latitude, pos.coords.longitude);
        } catch {/* noop */}
      })();
    }

    // 7) マーカー→カード
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    // 8) 現在地へ
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
        showSearchDot(me[0], me[1]);
      } catch {/* noop */}

      // 最寄りにフィット
      let nearest = null, best = Infinity;
      for (const it of lastData) {
        const dLat = (it.__lat - me[0]) * Math.PI / 180;
        const dLng = (it.__lng - me[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(me[0]*Math.PI/180)*Math.cos(it.__lat*Math.PI/180)*Math.sin(dLng/2)**2;
        const d = 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        if (d < best) { best = d; nearest = it; }
      }
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
