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
  try { const o = JSON.parse(localStorage.getItem(LS_LAST_CENTER) || "null");
    if (!o || !Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
    return [o.lat, o.lng];
  } catch { return null; }
};
const setLastCenter   = (lat,lng)=>{ try{localStorage.setItem(LS_LAST_CENTER,JSON.stringify({lat,lng,ts:Date.now()}));}catch{} };
const getCachedItems  = () => { try{ const a=JSON.parse(sessionStorage.getItem(SS_LAST_ITEMS)||"[]"); return Array.isArray(a)?a:[]; }catch{return [];} };
const setCachedItems  = (items)=>{ try{sessionStorage.setItem(SS_LAST_ITEMS,JSON.stringify(items||[]));}catch{} };

/* ===== Geocoding & Suggest (via same-origin proxy) =====
   ※ ここだけを使います。他所で geocodeJP/suggestJP を定義しないこと。 */
const Geo = (() => {
  const ENDPOINT = "/api/geo-proxy";
  async function fetchJSON(url) {
    const r = await fetch(url, { headers: { "Accept":"application/json" } });
    if (!r.ok) throw new Error(`${r.status}`);
    return r.json();
  }
  // 一点検索（緯度経度1件）
  async function geocode(q) {
    if (!q) return null;
    // 駅・ランドマークを優先（サーバ側でも class/type を絞っている想定）
    const url = `${ENDPOINT}?op=search&limit=1&countrycodes=jp&q=${encodeURIComponent(q)}`;
    const arr = await fetchJSON(url).catch(()=>null);
    if (!arr || !Array.isArray(arr) || !arr.length) return null;
    const { lat, lon, display_name } = arr[0] || {};
    const la = Number(lat), lo = Number(lon);
    return Number.isFinite(la) && Number.isFinite(lo) ? [la, lo, display_name] : null;
  }
  // サジェスト（駅・ランドマークのみ）
  async function suggest(q) {
    if (!q) return [];
    const url = `${ENDPOINT}?op=suggest&limit=8&countrycodes=jp&q=${encodeURIComponent(q)}`;
    const arr = await fetchJSON(url).catch(()=>[]);
    if (!Array.isArray(arr)) return [];
    const score = (it) => {
      const cls = it.class, typ = it.type;
      if (cls === "railway" && (typ === "station" || typ === "halt")) return 100;
      if (cls === "tourism") return 90;                 // 観光ランドマーク
      if (cls === "amenity" && ["university","library","park","museum","zoo","aquarium","shrine","temple"].includes(typ)) return 85;
      if (cls === "place" && ["city","town","village","suburb","neighbourhood"].includes(typ)) return 70;
      return 50;
    };
    return arr
      .map(it => {
        const la = Number(it.lat), lo = Number(it.lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
        const a = it.address || {};
        const name = it.name || it.display_name || "";
        const sub  = a.station || a.suburb || a.city || a.town || a.village || a.state || "";
        const icon = (it.class==="railway"?"🚉":it.class==="tourism"?"📍":it.class==="amenity"?"🏛️":"🗺️");
        return { name, sub, lat: la, lng: lo, icon, _score: score(it) };
      })
      .filter(Boolean)
      .sort((a,b)=>b._score-a._score)
      .slice(0,8);
  }
  return { geocode, suggest };
})();

/* ===== Main ===== */
(async function initShopsMap() {
  try {
    const mapAdp = createMapAdapter("leaflet");

    // URL param
    const params  = new URLSearchParams(location.search);
    const qParam  = (params.get("q") || "").trim();

    const searchInput = document.getElementById("q");
    const searchWrap  = searchInput?.closest(".map-search");
    let lastData = [];         // 直近の店舗データ（座標解決済み）
    const SEARCH_ZOOM = 16;

    // 地図をまず出す
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // サジェストの DOM
    let suggIdx = -1, suggItems = []; let box;
    const ensureBox = () => {
      if (box) return box;
      const wrap = searchInput?.closest(".map-search"); if (!wrap) return null;
      box = document.createElement("div"); box.className = "suggest-box"; box.hidden = true; wrap.appendChild(box); return box;
    };
    function closeSuggest() {
      const el = ensureBox(); if (!el) return;
      suggItems = []; suggIdx = -1; el.innerHTML = ""; el.hidden = true;
    }
    function renderSuggest(list) {
      const el = ensureBox(); if (!el) return;
      suggItems = list || []; suggIdx = -1;
      if (!suggItems.length) { closeSuggest(); return; }
      el.innerHTML = `
        <ul class="suggest-list">
          ${suggItems.map((s,i)=>`
            <li class="sugg" data-i="${i}">
              <span class="ic">${s.icon}</span>
              <span class="main">${s.name}</span>
              ${s.sub ? `<span class="sub">${s.sub}</span>` : ""}
            </li>`).join("")}
        </ul>`;
      el.hidden = false;
      el.querySelectorAll(".sugg").forEach(li=>{
        li.addEventListener("click", ()=>{ const i = Number(li.dataset.i); chooseSuggest(i); });
      });
    }
    function highlight(delta) {
      const el = ensureBox(); if (!el || el.hidden) return;
      const ns = [...el.querySelectorAll(".sugg")]; if (!ns.length) return;
      suggIdx = (suggIdx + delta + ns.length) % ns.length;
      ns.forEach((n,i)=>n.classList.toggle("is-active", i===suggIdx));
      ns[suggIdx]?.scrollIntoView?.({block:"nearest"});
    }
    async function chooseSuggest(i) {
      const s = suggItems[i]; if (!s) return;
      if (searchInput) searchInput.value = s.name;
      closeSuggest();
      await reloadAt(s.lat, s.lng, { focusOnly: true }); // 検索はクローズアップ
    }

    // キャッシュを即描画（体感を速く）
    const cached = getCachedItems().map((it) => {
      const [la, lo] = pickLatLng(it);
      return Number.isFinite(la) && Number.isFinite(lo) ? { ...it, __lat: la, __lng: lo } : null;
    }).filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, { chunk: 80, delay: 8 });
      mapAdp.fitToMarkers({ padding: 56 });
      lastData = cached;
    }

    // この地点を基準に店舗を再読込
    const reloadAt = async (lat, lng, { focusOnly = false } = {}) => {
      setLastCenter(lat, lng);
      mapAdp.setCenter(lat, lng, focusOnly ? SEARCH_ZOOM : 15);
      mapAdp.setSearchMarker?.(lat, lng);   // 検索地点ドット（adapter側で面倒見）

      // 近隣店舗
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

    // 初期表示：?q= があれば検索クローズアップ／無ければ現在地で通常描画
    if (qParam) {
      try { const hit = await Geo.geocode(qParam); if (hit) await reloadAt(hit[0], hit[1], { focusOnly: true }); }
      catch(e){ console.warn("[shops-map] geocode failed", e); }
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
        } catch {/* noop */}
      })();
    }

    // マーカークリック → カード
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    /* ===== 検索入力：サジェスト ===== */
    if (searchInput) {
      const runSuggest = debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) { closeSuggest(); return; }
        try { renderSuggest(await Geo.suggest(q)); } catch { closeSuggest(); }
      }, 200);

      searchInput.addEventListener("input", runSuggest);
      searchInput.addEventListener("keydown", (e)=>{
        if (e.key === "ArrowDown") { e.preventDefault(); highlight(+1); }
        else if (e.key === "ArrowUp") { e.preventDefault(); highlight(-1); }
        else if (e.key === "Enter") {
          e.preventDefault();
          if (suggIdx >= 0) { chooseSuggest(suggIdx); }
          else {
            const q = searchInput.value.trim();
            if (!q) return;
            Geo.geocode(q).then(hit=>{ if (hit) reloadAt(hit[0], hit[1], { focusOnly: true }); });
            closeSuggest();
          }
        } else if (e.key === "Escape") {
          closeSuggest();
        }
      });
      document.addEventListener("click", (ev)=>{ if (!searchWrap?.contains(ev.target)) closeSuggest(); });
    }

    // 現在地へ（現在地＋最寄り1件にフィット）
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
        mapAdp.setSearchMarker?.(me[0], me[1]);
      } catch {/* noop */}

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
