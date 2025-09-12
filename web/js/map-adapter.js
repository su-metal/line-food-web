// web/js/map-adapter.js
export function createMapAdapter(kind = "leaflet") {
  if (kind !== "leaflet") {
    throw new Error("Only Leaflet adapter is implemented in this build.");
  }
  return new LeafletAdapter();
}

class LeafletAdapter {
  map = null;

  // レイヤ分離：店舗とUI（検索ピン/現在地）
  layerShops = null;
  layerUI = null;

  markers = [];         // 店舗マーカー
  meDot = null;         // 現在地ドット
  searchMarker = null;  // 検索地点ピン
  clickHandler = null;  // 店舗マーカークリック時

  async init(domId, { center = [35.681236, 139.767125], zoom = 13 } = {}) {
    await ensureLeaflet();

    this.map = L.map(domId, { zoomControl: false });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(this.map);

    // 追加順で上に描かれる → UIを後から追加して前面へ
    this.layerShops = L.layerGroup().addTo(this.map);
    this.layerUI    = L.layerGroup().addTo(this.map);

    this.map.setView(center, zoom);
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    if (Number.isFinite(zoom)) this.map.setView([lat, lng], zoom);
    else this.map.panTo([lat, lng]);
  }

  /* ===== 現在地ドット（UIレイヤー） ===== */
  addCurrentDot(lat, lng) {
    if (!this.map) return null;
    if (!this.layerUI) this.layerUI = L.layerGroup().addTo(this.map);

    if (this.meDot) {
      this.meDot.setLatLng([lat, lng]);
      return this.meDot;
    }
    this.meDot = L.circleMarker([lat, lng], {
      radius: 6,
      color: "#2a6ef0",
      weight: 2,
      fillColor: "#2a6ef0",
      fillOpacity: 1,
    }).addTo(this.layerUI);
    this.meDot.bindTooltip("現在地", { permanent: false });
    return this.meDot;
  }

  /* ===== 検索地点ピン（UIレイヤー） ===== */
  setSearchMarker(lat, lng) {
    if (!this.map) return null;
    if (!this.layerUI) this.layerUI = L.layerGroup().addTo(this.map);

    if (this.searchMarker) {
      this.searchMarker.setLatLng([lat, lng]).bringToFront();
      return this.searchMarker;
    }
    this.searchMarker = L.marker([lat, lng], {
      icon: this.#makeSearchDivIcon(),
      riseOnHover: true,
      keyboard: false,
    }).addTo(this.layerUI);
    return this.searchMarker;
  }

  clearSearchMarker() {
    if (this.searchMarker) {
      this.layerUI?.removeLayer(this.searchMarker);
      this.searchMarker = null;
    }
  }

  /* ===== 店舗マーカー（店舗レイヤー） ===== */
  async setMarkers(items, { chunk = 100, delay = 0 } = {}) {
    if (!this.map) return [];
    if (!this.layerShops) this.layerShops = L.layerGroup().addTo(this.map);

    // 店舗レイヤのみクリア（UIは保持する）
    this.layerShops.clearLayers();
    this.markers = [];

    const icon = this.#makeShopDivIcon();

    const addBatch = (batch) => {
      for (const it of batch) {
        const lat = it.__lat ?? it.lat;
        const lng = it.__lng ?? it.lng ?? it.lon;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const m = L.marker([lat, lng], {
          icon,
          riseOnHover: true,
          keyboard: false,
        });
        m.__data = it;
        m.on("click", () => this.clickHandler?.(it));
        m.addTo(this.layerShops);
        this.markers.push(m);
      }
    };

    if (!delay || chunk >= items.length) {
      addBatch(items);
    } else {
      for (let i = 0; i < items.length; i += chunk) {
        addBatch(items.slice(i, i + chunk));
        if (delay) await sleep(delay);
      }
    }
    return this.markers;
  }

  onMarkerClick(fn) {
    this.clickHandler = fn;
  }

  fitToMarkers({ padding = 56, maxZoom = 16 } = {}) {
    if (!this.map) return;
    const bounds = L.latLngBounds([]);
    for (const m of this.markers) bounds.extend(m.getLatLng());
    if (!bounds.isValid()) return;
    this.map.fitBounds(bounds, { padding: [padding, padding], maxZoom });
  }

  /* ====== Pins (DivIcon SVG) ====== */

  // サイトカラーに追従する店舗ピン
  #makeShopDivIcon() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="36" height="48" viewBox="0 0 48 64" aria-hidden="true">
        <path d="M24 2C12.3 2 3 11.2 3 22.8c0 12.5 13 26 19.2 37 .9 1.6 3.7 1.6 4.6 0C32 48.8 45 35.3 45 22.8 45 11.2 35.7 2 24 2z" fill="currentColor"/>
        <circle cx="24" cy="22.5" r="13" fill="#fff"/>
        <g fill="none" stroke="currentColor" stroke-width="2">
          <rect x="15" y="18" width="18" height="10" rx="1.6"/>
          <path d="M15 18l2.5-4h13l2.5 4M24 18v10M19 28v-4M29 28v-4"/>
        </g>
      </svg>`;
    return L.divIcon({
      className: "shop-pin",
      html: svg,
      iconSize: [36, 48],
      iconAnchor: [18, 46],
    });
  }

  // 検索結果ピン（アクセント色）
  #makeSearchDivIcon() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 48 64" aria-hidden="true">
        <path d="M24 2C12.3 2 3 11.2 3 22.8c0 12.5 13 26 19.2 37 .9 1.6 3.7 1.6 4.6 0C32 48.8 45 35.3 45 22.8 45 11.2 35.7 2 24 2z" fill="currentColor"/>
        <circle cx="24" cy="22.5" r="9" fill="#fff"/>
        <path d="M21 20h6v6h-6z" fill="currentColor"/>
      </svg>`;
    return L.divIcon({
      className: "search-pin",
      html: svg,
      iconSize: [34, 46],
      iconAnchor: [17, 44],
    });
  }
}

/* ---- Helpers ---- */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function ensureLeaflet() {
  if (window.L) return;
  throw new Error("Leaflet not loaded. Include leaflet.js before this module.");
}
