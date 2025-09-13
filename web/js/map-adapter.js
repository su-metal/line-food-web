// web/js/map-adapter.js
// === Helpers (統一) ==========================================================
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}
function brandColor() {
  return cssVar("--brand", "#2d6b57");
}

// === Leaflet adapter =========================================================
class LeafletAdapter {
  constructor() {
    this.map = null;
    this._markersLayer = null;
    this._markers = [];
    this._onMarkerClick = null;
    this.layer = null; // 互換プロパティ（旧コード互換）
    this._currentDot = null;
    this._searchMarker = null;
  }

  async init(domId, { center = [35.681236, 139.767125], zoom = 13 } = {}) {
    const L = window.L;
    if (!L) throw new Error("Leaflet not loaded");
    // マップ
    this.map = L.map(domId, {
      zoomControl: false,
      attributionControl: true,
    }).setView(center, zoom);

    // タイル
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(this.map);

    // マーカーレイヤ
    this._markersLayer = L.layerGroup().addTo(this.map);
    this.layer = this._markersLayer; // 互換
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    if (Number.isFinite(zoom)) this.map.setView([lat, lng], zoom);
    else this.map.setView([lat, lng]);
  }

  fitToMarkers({ padding = 56, maxZoom = 17 } = {}) {
    const L = window.L;
    if (!this.map || !this._markers.length) return;
    const bounds = L.latLngBounds(
      this._markers.map((m) => m.getLatLng()).filter(Boolean)
    );
    if (bounds.isValid()) {
      const pad = Array.isArray(padding) ? padding : [padding, padding];
      this.map.fitBounds(bounds, { padding: pad, maxZoom });
    }
  }

  // ---- ピンSVG（ショップ）: _makeShopIcon で統一 ---------------------------
  _makeShopIcon(size = 32, color) {
    const col = color || brandColor();
    const S = Math.max(20, +size || 32);
    const H = Math.round(S * 1.35);
    const anchor = [Math.round(S / 2), H - 2];

    const html = `
<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${H}" viewBox="0 0 24 32" aria-hidden="true">
  <path d="M12 0C6 0 1.5 4.5 1.5 10.5 1.5 19 12 26 12 26s10.5-7 10.5-15.5C22.5 4.5 18 0 12 0Z"
        fill="${col}" stroke="white" stroke-width="2"/>
  <g transform="translate(4,7)" fill="white">
    <rect x="0" y="0" width="4.2" height="4" rx="0.8"/>
    <rect x="5.9" y="0" width="4.2" height="4" rx="0.8"/>
    <rect x="11.8" y="0" width="4.2" height="4" rx="0.8"/>
    <rect x="0" y="7" width="20" height="9" rx="1.2"/>
    <rect x="9" y="7" width="2" height="9" rx="0.8"/>
  </g>
</svg>`.trim();

    return {
      html,
      className: "pin-shop",
      iconSize: [S, H],
      iconAnchor: anchor,
      popupAnchor: [0, -Math.round(S * 0.7)],
    };
  }

  // ---- マーカー描画（click ハンドラ含む） ----------------------------------
  setMarkers(items = [], opts = {}) {
    const L = window.L;
    if (!L || !this.map) return [];

    // 既存をクリア
    if (this._markersLayer) this._markersLayer.remove();
    this._markersLayer = L.layerGroup().addTo(this.map);
    this.layer = this._markersLayer; // 互換
    this._markers = [];

    const size = Number(opts.size) || 32;
    const color = opts.color || brandColor();

    items.forEach((it) => {
      const lat = Number(it.__lat ?? it.lat);
      const lng = Number(it.__lng ?? it.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const def = this._makeShopIcon(size, color);
      const icon = L.divIcon({
        html: def.html,
        className: def.className,
        iconSize: def.iconSize,
        iconAnchor: def.iconAnchor,
        popupAnchor: def.popupAnchor,
      });

      const m = L.marker([lat, lng], { icon }).addTo(this._markersLayer);
      m.__data = it;
      if (this._onMarkerClick) m.on("click", () => this._onMarkerClick(it));
      this._markers.push(m);
    });

    return this._markers;
  }

  onMarkerClick(cb) {
    this._onMarkerClick = typeof cb === "function" ? cb : null;
  }

  // ---- 現在地ドット ----------------------------------------------------------
  addCurrentDot(lat, lng, { radius = 7 } = {}) {
    const L = window.L;
    if (!L || !this.map) return;
    if (!this._currentDot) {
      this._currentDot = L.circleMarker([lat, lng], {
        radius,
        color: "#2a6ef0",
        weight: 2,
        fillColor: "#2a6ef0",
        fillOpacity: 1,
      }).addTo(this.map);
    } else {
      this._currentDot.setLatLng([lat, lng]);
      if (typeof this._currentDot.bringToFront === "function")
        this._currentDot.bringToFront();
    }
  }

  // ---- 検索地点マーカー（単独） --------------------------------------------
  setSearchMarker(lat, lng) {
    const L = window.L;
    if (!L || !this.map) return;
    if (!this._searchMarker) {
      this._searchMarker = L.circleMarker([lat, lng], {
        radius: 6,
        color: "#2a6ef0",
        weight: 2,
        fillColor: "#2a6ef0",
        fillOpacity: 1,
      }).addTo(this.map);
    } else {
      this._searchMarker.setLatLng([lat, lng]);
      if (typeof this._searchMarker.bringToFront === "function")
        this._searchMarker.bringToFront();
    }
  }
}

// === Factory export ==========================================================
export function createMapAdapter(provider = "leaflet") {
  if (provider !== "leaflet") {
    console.warn("[map-adapter] Only Leaflet is supported for now.");
  }
  return new LeafletAdapter();
}
