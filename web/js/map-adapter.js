// web/js/map-adapter.js
// Leaflet 専用の簡易アダプタ。ピンサイズやサイトカラー（--brand）に対応。

export function createMapAdapter(provider = "leaflet") {
  if (provider !== "leaflet") {
    console.warn("[map-adapter] only Leaflet is implemented; falling back.");
  }
  return new LeafletAdapter();
}

/* ---------- helpers ---------- */
function getBrandColor() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--brand");
    return (v && v.trim()) || "#2a6ef0";
  } catch {
    return "#2a6ef0";
  }
}

class LeafletAdapter {
  constructor() {
    this.map = null;
    this.layer = null;
    this._shopLayer = null;
    this._lastMarkers = [];
    this._markerClickCb = null;
    this._currentDot = null;
    this.searchMarker = null;
  }

  async init(mapId, { center = [35.681236, 139.767125], zoom = 13 } = {}) {
    if (!window.L) throw new Error("Leaflet not loaded");
    this.map = window.L.map(mapId, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: true,
      tap: true,
    }).setView(center, zoom);

    // OSM タイル
    window.L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
    ).addTo(this.map);

    // まとめ用のレイヤー
    this.layer = window.L.layerGroup().addTo(this.map);
    this._shopLayer = window.L.layerGroup().addTo(this.layer);

    // モバイル向けパン/ズーム快適化
    this.map.on("click", () => {/* close popups if any */});
  }

  onMarkerClick(cb) {
    this._markerClickCb = typeof cb === "function" ? cb : null;
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    if (Number.isFinite(zoom)) this.map.setView([lat, lng], zoom);
    else this.map.panTo([lat, lng], { animate: true });
  }

  fitToMarkers({ padding = 56, maxZoom = 17 } = {}) {
    if (!this.map || !window.L) return;
    const all = (this._shopLayer && this._shopLayer.getLayers()) || [];
    if (!all.length) return;
    const latlngs = all.map((m) => m.getLatLng());
    const b = window.L.latLngBounds(latlngs);
    if (b.isValid()) this.map.fitBounds(b, { padding: [padding, padding], maxZoom });
  }

  addCurrentDot(lat, lng, { radius = 10 } = {}) {
    if (!this.map || !window.L) return null;
    const color = getBrandColor();
    if (!this._currentDot) {
      this._currentDot = window.L.circleMarker([lat, lng], {
        radius,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(this.layer || this.map);
    } else {
      this._currentDot.setLatLng([lat, lng]);
      this._currentDot.setStyle({ radius });
    }
    return this._currentDot;
  }

  setSearchMarker(lat, lng) {
    if (!this.map || !window.L) return null;
    const color = getBrandColor();
    if (!this.searchMarker) {
      this.searchMarker = window.L.circleMarker([lat, lng], {
        radius: 7,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 1,
      }).addTo(this.layer || this.map);
    } else {
      this.searchMarker.setLatLng([lat, lng]);
    }
    try { this.searchMarker.bringToFront?.(); } catch {}
    return this.searchMarker;
  }

  // ★ ここが統一名：_makeShopIcon（以前の _mkShopIcon は廃止）
  _makeShopIcon(size = 28) {
    const s = Math.max(14, Number(size) || 28);
    const color = getBrandColor();
    const html = `
      <svg width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" style="display:block">
        <path d="M12 22s-6.5-4.2-9-8c-1.6-2.9-.6-6 1.9-7.1 1.9-.9 4.2-.4 5.5 1.2 1.3-1.6 3.6-2.1 5.5-1.2 2.5 1.1 3.5 4.2 1.9 7.1-2.4 3.8-9 8-9 8z"
              fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="1.5"/>
        <rect x="7" y="9.2" width="10" height="7.6" rx="1.5" fill="white" stroke="${color}" stroke-width="1.3"/>
        <path d="M7 9.2h10l-1.2-2.6a1.2 1.2 0 0 0-1.1-.7H9.3a1.2 1.2 0 0 0-1.1.7L7 9.2Z" fill="${color}"/>
        <rect x="10" y="12.2" width="3.6" height="4.6" rx="0.6" fill="white" stroke="${color}" stroke-width="1.1"/>
      </svg>
    `;
    return window.L.divIcon({
      className: "lf-shop-pin",
      html,
      iconSize: [s, s],
      iconAnchor: [s / 2, s - 2],
    });
  }

  // 店舗マーカー一括セット（size を確実に反映）
  async setMarkers(items = [], { chunk = 80, delay = 8, size = 28 } = {}) {
    if (!this.map || !window.L) return [];
    if (!this._shopLayer) this._shopLayer = window.L.layerGroup().addTo(this.layer || this.map);
    this._shopLayer.clearLayers();
    this._lastMarkers = [];

    const makeOne = (d) => {
      const m = window.L.marker([d.__lat, d.__lng], { icon: this._makeShopIcon(size) });
      m.__data = d;
      m.on("click", () => this._markerClickCb?.(d));
      m.addTo(this._shopLayer);
      this._lastMarkers.push(m);
    };

    if (items.length <= chunk) {
      items.forEach(makeOne);
    } else {
      for (let i = 0; i < items.length; i += chunk) {
        items.slice(i, i + chunk).forEach(makeOne);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return this._lastMarkers;
  }
}
