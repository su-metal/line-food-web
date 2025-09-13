// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ================= Utils ================= */
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

/* =========== Bottom sheet (map card) =========== */
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

/* =============== Cache =============== */
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

/* =============== Geocoding via same-origin proxy（失敗時はローカル候補） =============== */
async function fetchJSON(url) {
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
/** qを1点にジオコーディング（緯度経度） */
async function geocode(q) {
  if (!q) return null;
  try {
    const params = new URLSearchParams({ op:"search", q, limit:"1", countrycodes:"jp" });
    const data = await fetchJSON(`/api/geo-proxy?${params.toString()}`);
    if (!Array.isArray(data) || !data.length) return null;
    const { lat, lon } = data[0];
    const la = Number(lat), lo = Number(lon);
    return (Number.isFinite(la) && Number.isFinite(lo)) ? { lat: la, lng: lo } : null;
  } catch {
    return null;
  }
}
/** サジェスト（駅/ランドマーク優先）。返り値: {name, sub, lat, lng, icon}[] */
async function suggest(q) {
  const LOCAL_FALLBACK = [
    { name: "東京駅", sub: "千代田区", lat: 35.681236, lng: 139.767125, icon: "🚉" },
    { name: "新宿駅", sub: "新宿区",   lat: 35.690921, lng: 139.700257, icon: "🚉" },
    { name: "渋谷駅", sub: "渋谷区",   lat: 35.658034, lng: 139.701636, icon: "🚉" },
    { name: "大阪駅", sub: "北区",     lat: 34.702485, lng: 135.495951, icon: "🚉" },
    { name: "名古屋駅", sub:"中村区",  lat: 35.170694, lng: 136.881637, icon: "🚉" },
  ];
  if (!q) return [];
  try {
    const params = new URLSearchParams({ op:"suggest", q, limit:"8", countrycodes:"jp" });
    const arr = await fetchJSON(`/api/geo-proxy?${params.toString()}`);
    if (!Array.isArray(arr)) return [];
    const score = (it) => {
      const cls = it.class, typ = it.type;
      if (cls === "railway" && (typ === "station" || typ === "halt")) return 100; // 駅
      if (cls === "tourism") return 85;                                           // ランドマーク
      if (cls === "amenity") return 70;
      if (cls === "place")   return 60;
      return 40;
    };
    return arr
      .map((it) => {
        const la = Number(it.lat), lo = Number(it.lon);
        if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
        const a = it.address || {};
        const name = it.namedetails?.name || it.name || it.display_name || "";
        const sub  = a.station || a.neighbourhood || a.suburb || a.city || a.town || a.village || a.county || a.state || "";
        const icon = (it.class==="railway"?"🚉":it.class==="tourism"?"📍":it.class==="amenity"?"🏢":it.class==="place"?"🗺️":"📍");
        return { name, sub, lat: la, lng: lo, icon, _score: score(it) };
      })
      .filter(Boolean)
      .sort((a,b)=>b._score-a._score)
      .slice(0,8);
  } catch {
    const qn = q.normalize("NFKC");
    return LOCAL_FALLBACK.filter(x => x.name.includes(qn) || qn.includes(x.name));
  }
}

/* ===================== Main ===================== */
(async function initShopsMap() {
  try {
    const mapAdp = createMapAdapter("leaflet");
    const params  = new URLSearchParams(location.search);
    const qParam  = (params.get("q") || "").trim();

    const searchInput = document.getElementById("q");
    const searchWrap  = searchInput?.closest(".map-search");

    let lastData = [];      // 直近に表示中の店舗
    const SEARCH_ZOOM = 16;

    // 1) 地図を先に表示
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // 検索地点のドット（map-adapter にメソッドがあれば利用）
    function showSearchDot(lat, lng) {
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
    }

    // 2) キャッシュ描画（体感高速化）
    const cached = getCachedItems().map((it) => {
      const [la, lo] = pickLatLng(it);
      return Number.isFinite(la) && Number.isFinite(lo) ? { ...it, __lat: la, __lng: lo } : null;
    }).filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, { chunk: 80, delay: 8 });
      mapAdp.fitToMarkers({ padding: 56 });
      lastData = cached;
    }

    // 3) 指定地点で店舗を再読込
    const reloadAt = async (lat, lng, { focusOnly = false } = {}) => {
      mapAdp.setCenter(lat, lng, focusOnly ? SEARCH_ZOOM : 15);
      showSearchDot(lat, lng);

      // 店舗取得
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

    // 4) 初期表示：?q= があれば検索地点へクローズアップ
    if (qParam) {
      try { const hit = await geocode(qParam); if (hit) await reloadAt(hit.lat, hit.lng, { focusOnly: true }); }
      catch(e){ console.warn("[shops-map] geocode failed", e); }
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

    // 5) マーカークリック → カード
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    /* ====== サジェスト＆確定動作（IME/PC/モバイル対応 Enter） ====== */
    (() => {
      if (!searchInput || !searchWrap) return;
      searchInput.setAttribute("enterkeyhint", "search");
      searchInput.setAttribute("inputmode", "search");
      searchInput.setAttribute("autocomplete", "off");

      let box = null, suggItems = [], suggIdx = -1;
      let composing = false;
      let pendingEnterWhileComposing = false;

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

      const commitQuery = async () => {
        const q = (searchInput.value || "").trim();
        hideSuggest();
        if (!q) return;
        try {
          const hit = await geocode(q);
          if (hit) await reloadAt(hit.lat, hit.lng, { focusOnly: true });
        } catch (e) {
          console.warn("[shops-map] geocode failed", e);
        }
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
      const runSuggest = debounce(() => {
        const q = searchInput.value.trim();
        if (!q) { hideSuggest(); return; }
        fetchSuggest(q);
      }, 200);

      // 入力で候補
      searchInput.addEventListener("input", runSuggest, { passive: true });

      // ↑↓ で選択
      const highlight = (delta) => {
        const el = ensureBox(); if (!el || el.hidden) return;
        const ns = [...el.querySelectorAll(".sugg")]; if (!ns.length) return;
        suggIdx = (suggIdx + delta + ns.length) % ns.length;
        ns.forEach((n,i)=>n.classList.toggle("is-active", i===suggIdx));
        ns[suggIdx]?.scrollIntoView?.({ block:"nearest" });
      };

      // Enter を頑強に処理（PC/モバイル/IME すべて）
      const handleEnterNow = (e) => {
        if (e?.cancelable) e.preventDefault();
        if (suggIdx >= 0) chooseSuggest(suggIdx);
        else commitQuery();
      };

      // IME の開始/終了
      searchInput.addEventListener("compositionstart", () => { composing = true; });
      searchInput.addEventListener("compositionend", () => {
        composing = false;
        if (pendingEnterWhileComposing) {
          pendingEnterWhileComposing = false;
          commitQuery();
        }
      });

      // keydown：Enter を最優先でハンドル
      searchInput.addEventListener("keydown", (e) => {
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

      // keyup：保険
      searchInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter" && pendingEnterWhileComposing) {
          pendingEnterWhileComposing = false;
          handleEnterNow(e);
        }
      });

      // keypress フォールバック
      searchInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter" && !composing && !e.isComposing) handleEnterNow(e);
      });

      // type=search の専用イベント（Safari 等）
      searchInput.addEventListener("search", () => commitQuery());

      // 外クリックで候補を閉じる
      document.addEventListener("click", (ev) => {
        if (!searchWrap.contains(ev.target)) hideSuggest();
      });

      // フォーカス外れたら候補を閉じる（クリック選択に影響しないよう遅延）
      searchInput.addEventListener("blur", () => setTimeout(hideSuggest, 120));
    })();

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

      // 最寄りを探して同画面に収まるように
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
