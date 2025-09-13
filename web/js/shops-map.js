// web/js/shops-map.js
import { apiJSON } from "./http.js";
import { createMapAdapter } from "./map-adapter.js";

/* ================= Utils ================= */
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
const debounce = (fn, ms = 400) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
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

/* =============== Cache =============== */
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

// 旧: fetchJSON を使って配列を期待している実装は削除

/** 1点へジオコーディング（proxy: { hit } 仕様） */
async function geocode(q) {
  if (!q) return null;
  try {
    const params = new URLSearchParams({
      op: "search",
      q,
      limit: "1",
      countrycodes: "jp",
    });
    const d = await apiJSON(`/api/geo-proxy?${params.toString()}`);
    const h = d?.hit;
    const la = Number(h?.lat),
      lo = Number(h?.lng);
    return Number.isFinite(la) && Number.isFinite(lo)
      ? { lat: la, lng: lo, name: h?.name || q }
      : null;
  } catch {
    return null;
  }
}

/** 駅・ランドマーク優先サジェスト（proxy: { items } 仕様） */
async function suggest(q) {
  if (!q) return [];
  try {
    const params = new URLSearchParams({
      op: "suggest",
      q,
      limit: "8",
      countrycodes: "jp",
    });
    const d = await apiJSON(`/api/geo-proxy?${params.toString()}`);
    const arr = Array.isArray(d?.items) ? d.items : [];
    return arr
      .map((it) => ({
        name: it.name || "",
        sub: it.sub || "",
        lat: Number(it.lat),
        lng: Number(it.lng),
        icon: it.icon || "📍",
      }))
      .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
  } catch {
    return [];
  }
}

/* =========== 検索 UI を確実に配線（地図初期化に依存しない） =========== */
function wireSearchUI({ onGo }) {
  const searchInput = document.getElementById("q");
  const wrap = searchInput?.closest(".map-search");
  if (!searchInput || !wrap) return;

  searchInput.setAttribute("enterkeyhint", "search");
  searchInput.setAttribute("inputmode", "search");
  searchInput.setAttribute("autocomplete", "off");

  let box = null,
    suggItems = [],
    suggIdx = -1;
  let composing = false;
  let pendingEnterWhileComposing = false;
  let lastSuggested = ""; // 同一クエリの無駄打ち抑制

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
    suggItems = [];
    suggIdx = -1;
  };
  const renderSuggest = (list) => {
    const el = ensureBox();
    suggItems = Array.isArray(list) ? list : [];
    suggIdx = -1;
    if (!suggItems.length) {
      hideSuggest();
      return;
    }
    el.innerHTML = `
      <ul class="suggest-list">
        ${suggItems
          .map(
            (s, i) => `
          <li class="sugg" data-i="${i}">
            <span class="ic">${s.icon || "📍"}</span>
            <span class="main">${s.name || ""}</span>
            ${s.sub ? `<span class="sub">${s.sub}</span>` : ""}
          </li>
        `
          )
          .join("")}
      </ul>`;
    el.hidden = false;
    el.querySelectorAll(".sugg").forEach((li) => {
      li.addEventListener("click", () => chooseSuggest(Number(li.dataset.i)));
    });
  };

  const commitQuery = async () => {
    const q = (searchInput.value || "").trim();
    hideSuggest();
    if (!q) return;

    // まず geocode（1点検索）→ ダメなら suggest の先頭でフォールバック
    let hit = await geocode(q).catch(() => null);
    if (!hit) {
      const cand = await suggest(q).catch(() => []);
      if (cand.length)
        hit = { lat: cand[0].lat, lng: cand[0].lng, name: cand[0].name };
    }
    if (hit && onGo) onGo(hit.lat, hit.lng, q, { focusOnly: true });
  };

  const chooseSuggest = async (i) => {
    const s = suggItems[i];
    if (!s) return;
    searchInput.value = s.name || "";
    hideSuggest();
    if (Number.isFinite(s.lat) && Number.isFinite(s.lng) && onGo) {
      onGo(s.lat, s.lng, s.name, { focusOnly: true });
    } else {
      commitQuery();
    }
  };

  const runSuggest = debounce(async () => {
    const q = searchInput.value.trim();
    if (!q) {
      hideSuggest();
      return;
    }
    const list = await suggest(q).catch(() => []);
    renderSuggest(list);
  }, 350);

  // 入力で候補（429予防でやや長めのデバウンス）
  searchInput.addEventListener("input", runSuggest, { passive: true });

  // IME
  searchInput.addEventListener("compositionstart", () => {
    composing = true;
  });
  searchInput.addEventListener("compositionend", () => {
    composing = false;
    if (pendingEnterWhileComposing) {
      pendingEnterWhileComposing = false;
      commitQuery();
    }
  });

  // Enter 系（keydown で最優先ハンドル）
  const handleEnterNow = (e) => {
    if (e?.cancelable) e.preventDefault();
    if (suggIdx >= 0) chooseSuggest(suggIdx);
    else commitQuery();
  };
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlight(+1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlight(-1);
      return;
    }
    if (e.key === "Enter") {
      if (composing || e.isComposing) {
        pendingEnterWhileComposing = true;
      } else {
        handleEnterNow(e);
      }
    }
  });
  searchInput.addEventListener("keyup", (e) => {
    if (e.key === "Enter" && pendingEnterWhileComposing) {
      pendingEnterWhileComposing = false;
      handleEnterNow(e);
    }
  });
  searchInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter" && !composing && !e.isComposing) handleEnterNow(e);
  });
  searchInput.addEventListener("search", () => commitQuery());

  // 外クリック/フォーカス外れで閉じる
  document.addEventListener("click", (ev) => {
    if (!wrap.contains(ev.target)) hideSuggest();
  });
  searchInput.addEventListener("blur", () => setTimeout(hideSuggest, 120));

  // ↑↓ 選択
  const highlight = (delta) => {
    const el = ensureBox();
    if (!el || el.hidden) return;
    const ns = [...el.querySelectorAll(".sugg")];
    if (!ns.length) return;
    suggIdx = (suggIdx + delta + ns.length) % ns.length;
    ns.forEach((n, i) => n.classList.toggle("is-active", i === suggIdx));
    ns[suggIdx]?.scrollIntoView?.({ block: "nearest" });
  };
}

/* =========== Bottom sheet =========== */
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

/* ===================== Main ===================== */
(async function initShopsMap() {
  // 1) 検索 UI は最初に配線（地図の成否に依存しない）
  wireSearchUI({
    onGo: (lat, lng, _q, { focusOnly } = {}) => {
      document.dispatchEvent(
        new CustomEvent("map:go-to", {
          detail: { lat, lng, focusOnly: !!focusOnly },
        })
      );
    },
  });

  let pendingGoTo = null;
  document.addEventListener("map:go-to", (ev) => {
    const d = ev.detail || {};
    // reloadAt がまだ無い段階は一旦キュー
    if (typeof reloadAt === "function") {
      reloadAt(d.lat, d.lng, { focusOnly: !!d.focusOnly });
    } else {
      pendingGoTo = d;
    }
  });

  try {
    const mapAdp = createMapAdapter("leaflet");
    const params = new URLSearchParams(location.search);
    const qParam = (params.get("q") || "").trim();
    const SEARCH_ZOOM = 16;

    // 2) 地図を先に表示
    let center = getLastCenter() || [35.681236, 139.767125];
    await mapAdp.init("map", { center, zoom: 13 });

    // 検索ドット（map-adapter 実装があれば使用）
    const showSearchDot = (lat, lng) => {
      setLastCenter(lat, lng);
      if (typeof mapAdp.setSearchMarker === "function") {
        mapAdp.setSearchMarker(lat, lng);
      } else if (window.L && (mapAdp.layerOverlay || mapAdp.map)) {
        if (!window.__searchDot) {
          window.__searchDot = window.L.circleMarker([lat, lng], {
            radius: 7,
            color: "#2a6ef0",
            weight: 2,
            fillColor: "#2a6ef0",
            fillOpacity: 1,
          }).addTo(mapAdp.layerOverlay || mapAdp.map);
        } else {
          window.__searchDot.setLatLng([lat, lng]);
        }
      }
    };

    // 3) キャッシュ描画
    let lastData = [];
    const cached = getCachedItems()
      .map((it) => {
        const [la, lo] = pickLatLng(it);
        return Number.isFinite(la) && Number.isFinite(lo)
          ? { ...it, __lat: la, __lng: lo }
          : null;
      })
      .filter(Boolean);
    if (cached.length) {
      await mapAdp.setMarkers(cached, {
        /* chunk: 80, delay: 8 */
      });
      mapAdp.fitToMarkers({ padding: 56 });
      lastData = cached;
    }

    // 4) 指定地点で店舗を再読込
    const reloadAt = async (lat, lng, { focusOnly = false } = {}) => {
      mapAdp.setCenter(lat, lng, focusOnly ? SEARCH_ZOOM : 15);
      showSearchDot(lat, lng);

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

      await mapAdp.setMarkers(withCoords);
      lastData = withCoords;
      setCachedItems(items);

      if (!focusOnly && withCoords.length) {
        mapAdp.fitToMarkers({ padding: 56 });
      }
    };

    if (
      pendingGoTo &&
      Number.isFinite(pendingGoTo.lat) &&
      Number.isFinite(pendingGoTo.lng)
    ) {
      reloadAt(pendingGoTo.lat, pendingGoTo.lng, {
        focusOnly: !!pendingGoTo.focusOnly,
      });
      pendingGoTo = null;
    }

    // 5) 初期表示：?q= あれば検索地点へ、なければ現在地
    if (qParam) {
      const hit = await geocode(qParam).catch(() => null);
      if (hit) await reloadAt(hit.lat, hit.lng, { focusOnly: true });
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

    // 6) マーカー→カード
    mapAdp.onMarkerClick((shop) => fillMapCard(shop));

    // 7) 現在地へ（現在地＋最寄り1件にフィット）
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

        let nearest = null,
          best = Infinity;
        for (const it of lastData) {
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

    // 8) 検索 UI からの指示を受けて移動
    document.addEventListener("map:go-to", (ev) => {
      const { lat, lng, focusOnly } = ev.detail || {};
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        reloadAt(lat, lng, { focusOnly: !!focusOnly });
      }
    });
  } catch (e) {
    console.error("[shops-map] fatal", e);
  }
})();
