// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ===== Utils ===== */
const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");
const km = (m) => (Number.isFinite(m) ? (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`) : "");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
function pickLatLng(obj) {
  const lat = num(obj?.lat) ?? num(obj?.latitude) ?? num(obj?.lat_deg) ??
              num(obj?.location?.lat) ?? num(obj?.coords?.lat) ?? num(obj?.geo?.lat);
  const lng = num(obj?.lng) ?? num(obj?.lon) ?? num(obj?.longitude) ?? num(obj?.lng_deg) ??
              num(obj?.location?.lng) ?? num(obj?.location?.lon) ??
              num(obj?.coords?.lng) ?? num(obj?.geo?.lng);
  return [lat, lng];
}
const debounce = (fn, ms=250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };

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

/* ===== Geocoding (Nominatim / OSM) ===== */
async function geocodeJP(q) {
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) return null;
  const arr = await r.json();
  if (!Array.isArray(arr) || !arr.length) return null;
  const { lat, lon, display_name } = arr[0] || {};
  const la = Number(lat), lo = Number(lon);
  return Number.isFinite(la) && Number.isFinite(lo) ? [la, lo, display_name] : null;
}

/* ---- Autocomplete (Nominatim) ---- */
async function suggestJP(q) {
  if (!q) return [];
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) return [];
  const arr = await r.json();
  if (!Array.isArray(arr)) return [];
  const score = (it) => {
    const cls = it.class, typ = it.type;
    if (cls === "railway" && (typ === "station" || typ === "halt")) return 100;
    if (cls === "amenity") return 80;
    if (cls === "tourism") return 75;
    if (cls === "place")   return 70;
    return 50;
  };
  return arr
    .map((it) => {
      const la = Number(it.lat), lo = Number(it.lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
      const a = it.address || {};
      const name = it.name || it.display_name || "";
      const sub  = a.station || a.neighbourhood || a.suburb || a.city || a.town || a.village || a.county || a.state || "";
      const icon = (it.class==="railway"?"🚉":it.class==="tourism"?"📍":it.class==="amenity"?"🏢":it.class==="place"?"🗺️":"📍");
      return { name, sub, lat: la, lng: lo, icon, _score: score(it) };
    })
    .filter(Boolean)
    .sort((a,b)=>b._score-a._score)
    .slice(0,6);
}

/* ===== Main ===== */
(async function initShopsMap() {
  try {
    const mapAdp = createMapAdapter("leaflet");

    // URL param
    const params  = new URLSearchParams(location.search);
    const qParam  = (params.get("q") || "").trim();

    const searchInput = document.getElementById("q");
    const searchWrap  = searchInput?.closest(".map-search");
    let lastData = [];         // 直近に表示した店舗データ
    let searchDot = null;      // 検索地点ドット
    const SEARCH_ZOOM = 16;    // ← 検索時はここにクローズアップ

    // 1) 地図をまず出す
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // 検索ドット（1個だけ）
    function showSearchDot(lat, lng) {
      setLastCenter(lat, lng);
      if (window.L && mapAdp.map) {
        if (!searchDot) {
          searchDot = window.L.circleMarker([lat, lng], {
            radius: 7, color: "#2a6ef0", weight: 2, fillColor: "#2a6ef0", fillOpacity: 1
          }).addTo(mapAdp.layer || mapAdp.map);
        } else {
          searchDot.setLatLng([lat, lng]);
        }
      }
    }

    // 2) キャッシュを即描画（体感を速く）
    const cached = getCachedItems().map((it) => {
      const [la, lo] = pickLatLng(it);
      return Number.isFinite(la) && Number.isFinite(lo) ? { ...it, __lat: la, __lng: lo } : null;
    }).filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, { chunk: 80, delay: 8 });
      mapAdp.fitToMarkers({ padding: 56 });
      lastData = cached;
    }

    // 3) 共通：この地点を基準に店舗を再読込
    //    options.focusOnly=true のときは「検索クローズアップ」＝ フィットしない
    const reloadAt = async (lat, lng, { focusOnly = false } = {}) => {
      // まず確実にクローズアップ or 通常ズームでセンター
      mapAdp.setCenter(lat, lng, focusOnly ? SEARCH_ZOOM : 15);
      showSearchDot(lat, lng);

      // 近隣店舗を取得
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

      // ★ 検索クローズアップ時はフィットしない（ズーム維持で検索地点を中心表示）
      if (!focusOnly && withCoords.length) {
        mapAdp.fitToMarkers({ padding: 56 });
      }
    };

    // 4) 初期：?q= があれば「検索クローズアップ」／無ければ現在地で通常描画
    if (qParam) {
      try { const hit = await geocodeJP(qParam); if (hit) await reloadAt(hit[0], hit[1], { focusOnly: true }); }
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

    // 5) マーカークリック
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    /* ====== サジェスト（Nominatim） ====== */
    let suggIdx = -1, suggItems = []; let box;
    const ensureBox = () => {
      if (box) return box;
      const wrap = searchInput?.closest(".map-search"); if (!wrap) return null;
      box = document.createElement("div"); box.className = "suggest-box"; box.hidden = true; wrap.appendChild(box); return box;
    };
    function renderSuggest(list) {
      const el = ensureBox(); if (!el) return;
      suggItems = list || []; suggIdx = -1;
      if (!suggItems.length) { el.hidden = true; el.innerHTML = ""; return; }
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
      renderSuggest([]);
      await reloadAt(s.lat, s.lng, { focusOnly: true }); // ← 検索はクローズアップ
    }

    if (searchInput) {
      const runSuggest = debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) { renderSuggest([]); return; }
        try { renderSuggest(await suggestJP(q)); } catch { renderSuggest([]); }
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
            geocodeJP(q).then(hit=>{ if (hit) reloadAt(hit[0], hit[1], { focusOnly: true }); });
          }
        } else if (e.key === "Escape") {
          renderSuggest([]);
        }
      });
      document.addEventListener("click", (ev)=>{ if (!searchWrap?.contains(ev.target)) renderSuggest([]); });
    }

    // 6) 現在地へ（現在地＋最寄り1件にフィット：従来どおり）
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
