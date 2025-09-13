// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ===== Utils ===== */
const NOIMG = "./img/noimg.svg";
const yen = (v) =>
  Number.isFinite(+v) ? "¥" + Number(v).toLocaleString("ja-JP") : "";
const km = (m) =>
  Number.isFinite(m)
    ? m < 1000
      ? `${Math.round(m)} m`
      : `${(m / 1000).toFixed(1)} km`
    : "";
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function pickLatLng(obj) {
  const lat =
    num(obj?.lat) ??
    num(obj?.latitude) ??
    num(obj?.lat_deg) ??
    num(obj?.location?.lat) ??
    num(obj?.coords?.lat) ??
    num(obj?.geo?.lat);
  const lng =
    num(obj?.lng) ??
    num(obj?.lon) ??
    num(obj?.longitude) ??
    num(obj?.lng_deg) ??
    num(obj?.location?.lng) ??
    num(obj?.location?.lon) ??
    num(obj?.coords?.lng) ??
    num(obj?.geo?.lng);
  return [lat, lng];
}
const debounce = (fn, ms = 250) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

/* ===== Bottom sheet ===== */
function fillMapCard(shop = {}) {
  const card = document.getElementById("map-card");
  if (!card) return;
  const title = document.getElementById("mc-title");
  const note = document.getElementById("mc-note");
  const meta = document.getElementById("mc-meta");
  const img = document.getElementById("mc-img");
  const link = document.getElementById("mc-link");

  title.textContent = shop.name || "店舗";
  img.src = shop.photo_url || shop.thumb_url || NOIMG;
  img.alt = shop.name || "店舗";

  const cat =
    shop.category_name ||
    shop.category ||
    shop.tags?.[0] ||
    shop.genres?.[0] ||
    "カテゴリ";
  const dist = km(shop.distance_m);
  const b0 = Array.isArray(shop.bundles) ? shop.bundles[0] : null;
  const time =
    b0?.slot_label ||
    b0?.slot ||
    b0?.time ||
    (shop.start && shop.end ? `${shop.start}–${shop.end}` : "");
  meta.innerHTML = `
    <span class="chip chip--brand">${cat}</span>
    ${dist ? `<span class="chip">${dist}</span>` : ""}
    ${time ? `<span class="chip">🕒 ${time}</span>` : ""}
  `;

  if (Array.isArray(shop.bundles) && shop.bundles.length) {
    const pVals = [
      shop.bundles[0]?.price_min,
      shop.bundles[0]?.price,
      shop.min_price,
    ]
      .map(Number)
      .filter(Number.isFinite);
    const minP = pVals.length ? Math.min(...pVals) : null;
    note.textContent =
      minP != null ? `最安 ${yen(minP)} から` : "販売中のセットがあります";
  } else {
    note.textContent = "現在のレスキュー依頼はありません。";
  }
  link.href = `/shop.html?id=${encodeURIComponent(shop.id)}`;
  card.hidden = false;
  card.classList.add("is-open");
}
document.getElementById("mc-close")?.addEventListener("click", () => {
  const card = document.getElementById("map-card");
  if (card) {
    card.classList.remove("is-open");
    card.hidden = true;
  }
});

/* ===== Cache (optimistic) ===== */
const LS_LAST_CENTER = "map:lastCenter"; // {lat,lng,ts}
const SS_LAST_ITEMS = "map:lastItems"; // items[]
const getLastCenter = () => {
  try {
    const o = JSON.parse(localStorage.getItem(LS_LAST_CENTER) || "null");
    if (!o || !Number.isFinite(o.lat) || !Number.isFinite(o.lng)) return null;
    return [o.lat, o.lng];
  } catch {
    return null;
  }
};
const setLastCenter = (lat, lng) => {
  try {
    localStorage.setItem(
      LS_LAST_CENTER,
      JSON.stringify({ lat, lng, ts: Date.now() })
    );
  } catch {}
};
const getCachedItems = () => {
  try {
    const a = JSON.parse(sessionStorage.getItem(SS_LAST_ITEMS) || "[]");
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};
const setCachedItems = (items) => {
  try {
    sessionStorage.setItem(SS_LAST_ITEMS, JSON.stringify(items || []));
  } catch {}
};

/* ===== Geocoding (Nominatim / OSM) ===== */
async function geocodeJP(q) {
  if (!q) return null;
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=jp&accept-language=ja&q=${encodeURIComponent(
    q
  )}`;
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) return null;
  const arr = await r.json();
  if (!Array.isArray(arr) || !arr.length) return null;
  const { lat, lon, display_name } = arr[0] || {};
  const la = Number(lat),
    lo = Number(lon);
  return Number.isFinite(la) && Number.isFinite(lo)
    ? [la, lo, display_name]
    : null;
}

/* ---- Autocomplete (Nominatim) — 駅名 & ランドマーク限定 ---- */
async function suggestJP(q) {
  if (!q) return [];
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `format=jsonv2&addressdetails=1&limit=8&countrycodes=jp&accept-language=ja&` +
    `q=${encodeURIComponent(q)}`;

  let arr = [];
  try {
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) return [];
    arr = await r.json();
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  // フィルタ条件：駅 or ランドマーク（厳しめ）
  const ALLOW = {
    railway: new Set(["station", "halt", "subway_entrance", "tram_stop"]),
    tourism: new Set([
      "attraction",
      "viewpoint",
      "museum",
      "gallery",
      "zoo",
      "aquarium",
      "theme_park",
      "artwork",
      "hotel" // 必要なら外してください
    ]),
    historic: "ANY", // 史跡系は広く許可（castle, monument, memorial など）
    natural: new Set(["peak", "volcano", "waterfall"]),
    aeroway: new Set(["aerodrome", "terminal"]),
    amenity: new Set([
      "university",
      "college",
      "hospital",
      "townhall",
      "library",
      "theatre",
      "stadium",
      "bus_station"
    ]),
  };

  const isAllowed = (it) => {
    const cls = it.class, typ = it.type;
    if (!cls) return false;
    const allow = ALLOW[cls];
    if (!allow) return false;
    if (allow === "ANY") return true;
    return allow.has?.(typ);
  };

  // スコア付け（駅を最優先）
  const score = (it) => {
    const { class: cls, type: typ } = it;
    if (cls === "railway" && (typ === "station" || typ === "halt" || typ === "subway_entrance")) return 100;
    if (cls === "tourism") return 90;
    if (cls === "historic") return 85;
    if (cls === "natural") return 80;
    if (cls === "aeroway") return 75;
    if (cls === "amenity") return 70;
    return 50;
  };

  const iconOf = (it) => {
    const cls = it.class, typ = it.type;
    if (cls === "railway") return "🚉";
    if (cls === "tourism") return "⭐";
    if (cls === "historic") return "🏰";
    if (cls === "natural") return "⛰️";
    if (cls === "aeroway") return "✈️";
    if (cls === "amenity") return "🏟️";
    return "📍";
  };

  return arr
    .filter(isAllowed)
    .map((it) => {
      const la = Number(it.lat), lo = Number(it.lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
      const a = it.address || {};
      const name = it.name || it.display_name || "";
      // 駅は路線や市区名をサブに
      const sub =
        a.railway || a.station || a.suburb || a.city || a.town || a.village || a.state || "";
      return { name, sub, lat: la, lng: lo, icon: iconOf(it), _score: score(it) };
    })
    .filter(Boolean)
    .sort((a, b) => b._score - a._score)
    .slice(0, 8);
}


/* ===== Main ===== */
(async function initShopsMap() {
  // ★ 追加：端末に応じたピンサイズ
  const PIN_SIZE = (() => {
    try {
      const isSP =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(max-width: 480px)").matches;
      return isSP ? 48 : 40; // ← 好みで調整：SP/PC
    } catch {
      return 36;
    }
  })();

  try {
    const mapAdp = createMapAdapter("leaflet");

    // URL param
    const params = new URLSearchParams(location.search);
    const qParam = (params.get("q") || "").trim();

    const searchInput = document.getElementById("q");
    const searchWrap = searchInput?.closest(".map-search");
    let lastData = []; // 直近に表示した店舗データ
    let searchDot = null; // 検索地点ドット
    const SEARCH_ZOOM = 16; // ← 検索時はここにクローズアップ

    // 1) 地図をまず出す
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // 検索ドット（1個だけ）
    function showSearchDot(lat, lng) {
      setLastCenter(lat, lng);

      // まずはアダプタに任せる（UI専用レイヤで保持され、setMarkers()で消えない）
      if (mapAdp && typeof mapAdp.setSearchMarker === "function") {
        mapAdp.setSearchMarker(lat, lng);
        return;
      }

      // --- フォールバック（旧実装互換）：直接 Leaflet で描画 ---
      if (window.L && mapAdp?.map) {
        if (!searchDot) {
          searchDot = window.L.circleMarker([lat, lng], {
            radius: 7,
            color: "#2a6ef0",
            weight: 2,
            fillColor: "#2a6ef0",
            fillOpacity: 1,
          }).addTo(mapAdp.map);
        } else {
          searchDot.setLatLng([lat, lng]);
        }
      }
    }

    // 2) キャッシュを即描画（体感を速く）
    const cached = getCachedItems()
      .map((it) => {
        const [la, lo] = pickLatLng(it);
        return Number.isFinite(la) && Number.isFinite(lo)
          ? { ...it, __lat: la, __lng: lo }
          : null;
      })
      .filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, { chunk: 80, delay: 8, size: PIN_SIZE });
      mapAdp.fitToMarkers({ padding: 56 });
      lastData = cached;
    }

    // 3) 共通：この地点を基準に店舗を再読込
    //    options.focusOnly=true のときは「検索クローズアップ」＝ フィットしない
    const reloadAt = async (lat, lng, { focusOnly = false } = {}) => {
      hideSuggest();
      // まず確実にクローズアップ or 通常ズームでセンター
      mapAdp.setCenter(lat, lng, focusOnly ? SEARCH_ZOOM : 15);
      showSearchDot(lat, lng);

      // 近隣店舗を取得
      let items = [];
      try {
        const qs = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          radius: "3000",
          limit: "60",
        });
        const near = await apiJSON(`/api/nearby?${qs.toString()}`);
        items = Array.isArray(near?.items) ? near.items : [];
        if (!items.length) {
          const recent = await apiJSON(`/api/shops-recent?limit=30`);
          items = Array.isArray(recent?.items) ? recent.items : [];
        }
      } catch (e) {
        console.warn("[shops-map] list fetch failed", e);
      }

      const withCoords = items
        .map((it) => {
          const [la, lo] = pickLatLng(it);
          return Number.isFinite(la) && Number.isFinite(lo)
            ? { ...it, __lat: la, __lng: lo }
            : null;
        })
        .filter(Boolean);

      await mapAdp.setMarkers(withCoords, {
        chunk: 80,
        delay: 8,
        size: PIN_SIZE,
      });
      lastData = withCoords;
      setCachedItems(items);

      // ★ 検索クローズアップ時はフィットしない（ズーム維持で検索地点を中心表示）
      if (!focusOnly && withCoords.length) {
        mapAdp.fitToMarkers({ padding: 56 });
      }
    };

    // 4) 初期：?q= があれば「検索クローズアップ」／無ければ現在地で通常描画
    if (qParam) {
      try {
        const hit = await geocodeJP(qParam);
        if (hit) await reloadAt(hit[0], hit[1], { focusOnly: true });
      } catch (e) {
        console.warn("[shops-map] geocode failed", e);
      }
    } else {
      (async () => {
        try {
          const pos = await new Promise((res, rej) => {
            if (!navigator.geolocation) return rej(new Error("no_geolocation"));
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy: false,
              timeout: 8000,
              maximumAge: 60000,
            });
          });
          await reloadAt(pos.coords.latitude, pos.coords.longitude);
        } catch {
          /* noop */
        }
      })();
    }

    // 5) マーカークリック
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    /* ====== サジェスト（Nominatim） ====== */
    /* ====== サジェスト（Nominatim） ====== */
    let suggIdx = -1,
      suggItems = [];
    let box;

    const ensureBox = () => {
      if (box) return box;
      const wrap = document.getElementById("q")?.closest(".map-search");
      if (!wrap) return null;
      box = document.createElement("div");
      box.className = "suggest-box";
      box.hidden = true;
      wrap.appendChild(box);
      return box;
    };

    function hideSuggest() {
      const el = ensureBox();
      if (!el) return;
      el.hidden = true;
      el.innerHTML = "";
      suggItems = [];
      suggIdx = -1;
    }

    function renderSuggest(list) {
      const el = ensureBox();
      if (!el) return;
      if (!list || !list.length) {
        hideSuggest();
        return;
      }

      suggItems = list;
      suggIdx = -1;
      el.innerHTML = `
    <ul class="suggest-list">
      ${list
        .map(
          (s, i) => `
        <li class="sugg" data-i="${i}">
          <span class="ic">${s.icon}</span>
          <span class="main">${s.name}</span>
          ${s.sub ? `<span class="sub">${s.sub}</span>` : ""}
        </li>`
        )
        .join("")}
    </ul>
  `;
      el.hidden = false;

      el.querySelectorAll(".sugg").forEach((li) => {
        li.addEventListener("click", async () => {
          const i = Number(li.dataset.i);
          const s = suggItems[i];
          if (!s) return;
          const input = document.getElementById("q");
          if (input) input.value = s.name;
          hideSuggest(); // ← 選択時に即クローズ
          await reloadAt(s.lat, s.lng, { focusOnly: true });
        });
      });
    }

    function highlight(delta) {
      const el = ensureBox();
      if (!el || el.hidden) return;
      const ns = [...el.querySelectorAll(".sugg")];
      if (!ns.length) return;
      suggIdx = (suggIdx + delta + ns.length) % ns.length;
      ns.forEach((n, i) => n.classList.toggle("is-active", i === suggIdx));
      ns[suggIdx]?.scrollIntoView?.({ block: "nearest" });
    }

    (function wireSuggest() {
      const input = document.getElementById("q");
      const wrap = input?.closest(".map-search");
      if (!input || !wrap) return;

      const runSuggest = debounce(async () => {
        const q = input.value.trim();
        if (!q) {
          hideSuggest();
          return;
        }
        try {
          renderSuggest(await suggestJP(q));
        } catch {
          hideSuggest();
        }
      }, 200);

      input.addEventListener("input", runSuggest);

      input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          highlight(+1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          highlight(-1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          const chosen = suggIdx >= 0 ? suggItems[suggIdx] : null;
          hideSuggest(); // ← Enterで移動する前に確実に閉じる
          if (chosen) {
            reloadAt(chosen.lat, chosen.lng, { focusOnly: true });
          } else {
            const q = input.value.trim();
            if (!q) return;
            geocodeJP(q).then((hit) => {
              if (hit) reloadAt(hit[0], hit[1], { focusOnly: true });
            });
          }
        } else if (e.key === "Escape") {
          hideSuggest();
        }
      });

      // フォーカス外れ / 画面のどこかをクリックで閉じる
      input.addEventListener("blur", () => setTimeout(hideSuggest, 100));
      document.addEventListener("click", (ev) => {
        if (!wrap.contains(ev.target)) hideSuggest();
      });

      // 地図操作が始まったら閉じる（プログラム/ユーザー操作どちらでも）
      try {
        const map = window.__leafletMap || (window.L && window.L.mapInstance);
        const m = (window.mapAdp && window.mapAdp.map) || map;
        if (m && m.on) {
          ["movestart", "dragstart", "zoomstart", "click"].forEach((ev) =>
            m.on(ev, hideSuggest)
          );
        }
      } catch {}
    })();

    // 6) 現在地へ（現在地＋最寄り1件にフィット：従来どおり）
    document
      .getElementById("btnLocate")
      ?.addEventListener("click", async () => {
        let me = center;
        try {
          const pos = await new Promise((res, rej) => {
            if (!navigator.geolocation) return rej(new Error("no_geolocation"));
            navigator.geolocation.getCurrentPosition(res, rej, {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0,
            });
          });
          me = [pos.coords.latitude, pos.coords.longitude];
          showSearchDot(me[0], me[1]);
        } catch {
          /* noop */
        }

        // 最寄り計算
        let nearest = null,
          best = Infinity;
        const items = lastData || [];
        for (const it of items) {
          const dLat = ((it.__lat - me[0]) * Math.PI) / 180;
          const dLng = ((it.__lng - me[1]) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((me[0] * Math.PI) / 180) *
              Math.cos((it.__lat * Math.PI) / 180) *
              Math.sin(dLng / 2) ** 2;
          const d = 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          if (d < best) {
            best = d;
            nearest = it;
          }
        }
        if (nearest && window.L) {
          const b = window.L.latLngBounds([me, [nearest.__lat, nearest.__lng]]);
          if (b.isValid())
            mapAdp.map.fitBounds(b, { padding: [60, 60], maxZoom: 17 });
        } else {
          mapAdp.setCenter(me[0], me[1], 15);
        }
      });
  } catch (e) {
    console.error("[shops-map] fatal", e);
  }
})();
