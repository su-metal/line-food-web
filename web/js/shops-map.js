// web/js/shops-map.js  ← すべて置き換え
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ================= Utils ================= */
const NOIMG = "./img/noimg.svg";
const yen = (v) => (Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "");
const km  = (m) => (Number.isFinite(m) ? (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`) : "");
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const debounce = (fn, ms=250) => { let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; };
const log = (...a) => console.info("[search]", ...a);

function pickLatLng(obj) {
  const lat = num(obj?.lat) ?? num(obj?.latitude) ?? num(obj?.lat_deg) ??
              num(obj?.location?.lat) ?? num(obj?.coords?.lat) ?? num(obj?.geo?.lat);
  const lng = num(obj?.lng) ?? num(obj?.lon) ?? num(obj?.longitude) ?? num(obj?.lng_deg) ??
              num(obj?.location?.lng) ?? num(obj?.location?.lon) ??
              num(obj?.coords?.lng) ?? num(obj?.geo?.lng);
  return [lat, lng];
}

/* ---- ローカル・フォールバック（主要都市/駅） ---- */
const LOCAL_FALLBACK = [
  { name:"東京",     sub:"千代田区", lat:35.6895,   lng:139.6917,  icon:"🗺️" },
  { name:"東京駅",   sub:"千代田区", lat:35.681236, lng:139.767125, icon:"🚉" },
  { name:"新宿駅",   sub:"新宿区",   lat:35.690921, lng:139.700257, icon:"🚉" },
  { name:"渋谷駅",   sub:"渋谷区",   lat:35.658034, lng:139.701636, icon:"🚉" },
  { name:"横浜",     sub:"西区",     lat:35.466,    lng:139.622,    icon:"🗺️" },
  { name:"横浜駅",   sub:"西区",     lat:35.46583,  lng:139.622,    icon:"🚉" },
  { name:"名古屋",   sub:"中区",     lat:35.1815,   lng:136.9066,   icon:"🗺️" },
  { name:"名古屋駅", sub:"中村区",   lat:35.170694, lng:136.881637, icon:"🚉" },
  { name:"大阪",     sub:"北区",     lat:34.6937,   lng:135.5023,   icon:"🗺️" },
  { name:"大阪駅",   sub:"北区",     lat:34.702485, lng:135.495951, icon:"🚉" },
  { name:"京都",     sub:"中京区",   lat:35.0116,   lng:135.7681,   icon:"🗺️" },
  { name:"京都駅",   sub:"下京区",   lat:34.985849, lng:135.758766, icon:"🚉" },
  { name:"札幌",     sub:"中央区",   lat:43.0618,   lng:141.3545,   icon:"🗺️" },
  { name:"札幌駅",   sub:"北区",     lat:43.06866,  lng:141.35076,  icon:"🚉" },
  { name:"豊橋",     sub:"",         lat:34.7692,   lng:137.3914,   icon:"🗺️" },
  { name:"豊橋駅",   sub:"",         lat:34.7629,   lng:137.3831,   icon:"🚉" },
];
const localFind = (q) => {
  const s = (q || "").trim().normalize("NFKC");
  if (!s) return null;
  return LOCAL_FALLBACK.find(x => s.includes(x.name) || x.name.includes(s)) || null;
};

/* =============== Cache =============== */
const LS_LAST_CENTER = "map:lastCenter";
const SS_LAST_ITEMS  = "map:lastItems";

const getLastCenter = () => {
  try { const o = JSON.parse(localStorage.getItem(LS_LAST_CENTER) || "null");
    if (!o || !Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
    return [o.lat, o.lng];
  } catch { return null; }
};
const setLastCenter   = (lat,lng)=>{ try{localStorage.setItem(LS_LAST_CENTER,JSON.stringify({lat,lng,ts:Date.now()}));}catch{} };
const getCachedItems  = () => { try{ const a=JSON.parse(sessionStorage.getItem(SS_LAST_ITEMS)||"[]"); return Array.isArray(a)?a:[]; }catch{return [];} };
const setCachedItems  = (items)=>{ try{sessionStorage.setItem(SS_LAST_ITEMS,JSON.stringify(items||[]));}catch{} };

/* =============== Geocoding via same-origin proxy =============== */
async function geocode(q) {
  if (!q) return null;
  try {
    const params = new URLSearchParams({ op:"search", q, limit:"1", countrycodes:"jp" });
    const res = await apiJSON(`/api/geo-proxy?${params.toString()}`);
    const h = res?.hit;
    if (!h) return null;
    const la = Number(h.lat), lo = Number(h.lng ?? h.lon);
    return (Number.isFinite(la) && Number.isFinite(lo)) ? { lat: la, lng: lo, name:h.name, sub:h.sub } : null;
  } catch {
    return null;
  }
}
/** 駅・ランドマーク優先のサジェスト（空時はローカル候補で補完） */
async function suggest(q) {
  if (!q) return [];
  try {
    const params = new URLSearchParams({ op:"suggest", q, limit:"8", countrycodes:"jp" });
    const res = await apiJSON(`/api/geo-proxy?${params.toString()}`);
    const arr = Array.isArray(res?.items) ? res.items : [];
    if (arr.length) {
      return arr.map(it => {
        const la = Number(it.lat), lo = Number(it.lng ?? it.lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
        return { name: it.name || "", sub: it.sub || "", lat: la, lng: lo, icon: it.icon || "📍" };
      }).filter(Boolean);
    }
  } catch {/* fall through */}
  // 失敗/空のときはローカル候補
  const s = (q || "").trim().normalize("NFKC");
  return LOCAL_FALLBACK.filter(x => x.name.includes(s) || s.includes(x.name)).slice(0,8);
}

/* =========== サジェスト：body直下に絶対配置（クリップ対策） =========== */
function ensureSuggestStyles() {
  if (document.getElementById("suggest-style")) return;
  const css = `
  .suggest-box{position:absolute;z-index:9999;min-width:240px;max-width:80vw;
    background:#fff;border-radius:12px;box-shadow:0 10px 24px rgba(0,0,0,.16),0 2px 6px rgba(0,0,0,.08);
    overflow:hidden;border:1px solid rgba(0,0,0,.06)}
  .suggest-box[hidden]{display:none!important}
  .suggest-list{list-style:none;margin:0;padding:6px}
  .suggest-list .sugg{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:10px;cursor:pointer}
  .suggest-list .sugg:hover,.suggest-list .sugg.is-active{background:rgba(0,0,0,.06)}
  .suggest-list .sugg .ic{width:1.2em}
  .suggest-list .sugg .main{font-weight:600}
  .suggest-list .sugg .sub{color:#666;font-size:.9em;margin-left:auto;padding-left:12px}
  `;
  const st = document.createElement("style");
  st.id = "suggest-style";
  st.textContent = css;
  document.head.appendChild(st);
}

/* =========== 検索 UI =========== */
function wireSearchUI({ onGo }) {
  ensureSuggestStyles();

  const searchInput = document.getElementById("q");
  const wrap = searchInput?.closest(".map-search");
  if (!searchInput || !wrap) { console.warn("[search] input #q not found"); return; }

  searchInput.setAttribute("enterkeyhint", "search");
  searchInput.setAttribute("inputmode", "search");
  searchInput.setAttribute("autocomplete", "off");

  // サジェストボックスは body 直下
  let box = document.createElement("div");
  box.className = "suggest-box";
  box.hidden = true;
  document.body.appendChild(box);

  let suggItems = [], suggIdx = -1;
  let composing = false;
  let pendingEnterWhileComposing = false;

  const placeBox = () => {
    const r = searchInput.getBoundingClientRect();
    const x = Math.round(r.left + window.scrollX);
    const y = Math.round(r.bottom + window.scrollY + 6);
    const w = Math.round(r.width);
    box.style.left = x + "px";
    box.style.top  = y + "px";
    box.style.minWidth = Math.max(240, w) + "px";
  };
  const hideSuggest = () => { box.hidden = true; box.innerHTML = ""; suggItems = []; suggIdx = -1; };
  const renderSuggest = (list) => {
    suggItems = Array.isArray(list) ? list : [];
    suggIdx = -1;
    if (!suggItems.length) { hideSuggest(); return; }
    placeBox();
    box.innerHTML = `
      <ul class="suggest-list">
        ${suggItems.map((s,i)=>`
          <li class="sugg" data-i="${i}">
            <span class="ic">${s.icon || "📍"}</span>
            <span class="main">${s.name || ""}</span>
            ${s.sub ? `<span class="sub">${s.sub}</span>` : ""}
          </li>
        `).join("")}
      </ul>`;
    box.hidden = false;
    box.querySelectorAll(".sugg").forEach(li=>{
      li.addEventListener("click", () => chooseSuggest(Number(li.dataset.i)));
    });
  };
  const highlight = (delta) => {
    if (box.hidden) return;
    const ns = [...box.querySelectorAll(".sugg")]; if (!ns.length) return;
    suggIdx = (suggIdx + delta + ns.length) % ns.length;
    ns.forEach((n,i)=>n.classList.toggle("is-active", i===suggIdx));
    ns[suggIdx]?.scrollIntoView?.({ block:"nearest" });
  };

  const chooseSuggest = async (i) => {
    const s = suggItems[i];
    if (!s) return;
    searchInput.value = s.name || "";
    hideSuggest();
    if (Number.isFinite(s.lat) && Number.isFinite(s.lng) && onGo) {
      console.info("[search] go(suggest)", s);
      onGo(s.lat, s.lng, s.name, { focusOnly: true });
    } else {
      commitQuery();
    }
  };

  const commitQuery = async () => {
    const q = (searchInput.value || "").trim();
    hideSuggest();
    if (!q) return;
    log("commit", q);

    // 1) geocode
    let hit = await geocode(q).catch(()=>null);

    // 2) 取れなければ suggest 先頭
    if (!hit) {
      const list = await suggest(q).catch(()=>[]);
      if (list && list[0]) hit = list[0];
    }

    // 3) それでも無ければローカル候補
    if (!hit) hit = localFind(q);

    if (hit && onGo) {
      console.info("[search] go(commit)", hit);
      onGo(hit.lat, hit.lng, hit.name || q, { focusOnly: true });
    } else {
      console.warn("[search] no hit for:", q);
    }
  };

  const runSuggest = debounce(async () => {
    const q = searchInput.value.trim();
    if (!q) { hideSuggest(); return; }
    const list = await suggest(q).catch(()=>[]);
    log("suggest", q, list.length);
    renderSuggest(list);
  }, 200);

  // 入力で候補
  searchInput.addEventListener("input", runSuggest, { passive: true });

  // IME
  searchInput.addEventListener("compositionstart", () => { composing = true; });
  searchInput.addEventListener("compositionend", () => {
    composing = false;
    if (pendingEnterWhileComposing) { pendingEnterWhileComposing = false; commitQuery(); }
    else { runSuggest(); }
  });

  // Enter 系
  const handleEnterNow = (e) => {
    if (e?.cancelable) e.preventDefault();
    if (suggIdx >= 0) chooseSuggest(suggIdx);
    else commitQuery();
  };
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); highlight(+1); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); highlight(-1); return; }
    if (e.key === "Enter") {
      if (composing || e.isComposing) pendingEnterWhileComposing = true;
      else handleEnterNow(e);
    }
  });
  searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter" && pendingEnterWhileComposing) { pendingEnterWhileComposing = false; handleEnterNow(e); }
  });
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !composing && !e.isComposing) handleEnterNow(e);
  });
  searchInput.addEventListener("search", () => commitQuery());

  // 入力欄以外のクリック＝虫眼鏡タップでも実行
  const stopIfInside = (el, t) => el.contains(t) && t.tagName === "INPUT";
  wrap.addEventListener("click", (ev) => { if (!stopIfInside(wrap, ev.target) && (searchInput.value || "").trim()) commitQuery(); });

  // 配置追従／外クリックで閉じる
  window.addEventListener("scroll", () => { if (!box.hidden) placeBox(); }, { passive:true });
  window.addEventListener("resize", () => { if (!box.hidden) placeBox(); });
  document.addEventListener("click", (ev) => { if (!wrap.contains(ev.target) && !box.contains(ev.target)) hideSuggest(); });
  searchInput.addEventListener("blur", () => setTimeout(hideSuggest, 120));
}

/* =========== Bottom sheet =========== */
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

/* ===================== Main ===================== */
(async function initShopsMap() {
  // 検索 UI は真っ先に配線
  wireSearchUI({
    onGo: (lat, lng, _q, { focusOnly } = {}) => {
      console.info("[map] dispatch go-to", {lat, lng, focusOnly});
      document.dispatchEvent(new CustomEvent("map:go-to", { detail: { lat, lng, focusOnly: !!focusOnly }}));
    }
  });

  try {
    const mapAdp = createMapAdapter("leaflet");
    const params  = new URLSearchParams(location.search);
    const qParam  = (params.get("q") || "").trim();
    const SEARCH_ZOOM = 16;

    // 1) 地図を表示
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // 検索ドット
    const showSearchDot = (lat, lng) => {
      setLastCenter(lat, lng);
      if (typeof mapAdp.setSearchMarker === "function") {
        mapAdp.setSearchMarker(lat, lng);
      } else if (window.L && mapAdp.map) {
        if (!window.__searchDot) {
          window.__searchDot = window.L.circleMarker([lat, lng], {
            radius: 7, color: "#2a6ef0", weight: 2, fillColor: "#2a6ef0", fillOpacity: 1
          }).addTo(mapAdp.layer || mapAdp.map);
        } else {
          window.__searchDot.setLatLng([lat, lng]);
        }
      }
    };

    // 2) キャッシュ描画
    let lastData = [];
    const cached = getCachedItems().map((it) => {
      const [la, lo] = pickLatLng(it);
      return Number.isFinite(la) && Number.isFinite(lo) ? { ...it, __lat: la, __lng: lo } : null;
    }).filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, {});
      mapAdp.fitToMarkers({ padding: 56 });
      lastData = cached;
    }

    // 3) 指定地点で店舗を再読込
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

      await mapAdp.setMarkers(withCoords, {});
      lastData = withCoords;
      setCachedItems(items);

      if (!focusOnly && withCoords.length) {
        mapAdp.fitToMarkers({ padding: 56 });
      }
    };

    // 4) 初期表示：?q= があれば検索地点へ
    if (qParam) {
      const hit = await geocode(qParam).catch(()=>null);
      if (hit) await reloadAt(hit.lat, hit.lng, { focusOnly: true });
    } else {
      // 現在地が取れれば通常描画
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

    // 5) マーカー→カード
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    // 6) 「現在地へ」
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

    // 7) 検索 UI → 地図へ
    document.addEventListener("map:go-to", (ev) => {
      const { lat, lng, focusOnly } = ev.detail || {};
      console.info("[map] go-to received", ev.detail);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        reloadAt(lat, lng, { focusOnly: !!focusOnly });
      }
    });

  } catch (e) {
    console.error("[shops-map] fatal", e);
  }
})();
