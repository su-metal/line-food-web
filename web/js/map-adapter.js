// web/js/map-adapter.js
// Leaflet 専用のアダプタ。shops-map.js から呼ぶ最小 API を提供。
export function createMapAdapter(kind = "leaflet") {
  return new LeafletAdapter();
}

class LeafletAdapter {
  constructor() {
    this.map = null;
    this.layer = null;
    this._markers = [];
    this._markerClick = null;
    this.currentDot = null;
    this.searchMarker = null;
  }

  async init(containerId, { center = [35.681236, 139.767125], zoom = 13 } = {}) {
    const L = window.L;
    if (!L) throw new Error("Leaflet not loaded");

    this.map = L.map(containerId, { zoomControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(this.map);

    this.layer = L.layerGroup().addTo(this.map);
    this.map.setView(center, zoom);
    return this;
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    if (Number.isFinite(zoom)) this.map.setView([lat, lng], zoom, { animate: true });
    else this.map.panTo([lat, lng], { animate: true });
  }

  onMarkerClick(fn) {
    this._markerClick = fn;
  }

  // ★ 関数名は _makeShopIcon に統一（_mkShopIcon は存在しません）
  _makeShopIcon({ size } = {}) {
    const L = window.L;
    const css = getComputedStyle(document.documentElement);
    const brand =
      (css.getPropertyValue("--brand") || css.getPropertyValue("--accent") || "#A67C52").trim() ||
      "#A67C52";
    const stroke = "rgba(0,0,0,.25)";
    const isSmall = window.matchMedia("(max-width:480px)").matches;
    const SIZE = Math.max(18, Math.min(44, Number(size) || (isSmall ? 26 : 24)));

    const html = `
      <div class="shop-pin" style="width:${SIZE}px;height:${SIZE}px;transform:translate(-50%,-100%);">
        <svg viewBox="0 0 24 24" width="${SIZE}" height="${SIZE}" aria-hidden="true">
          <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"
                fill="${brand}" stroke="${stroke}" stroke-width="1"/>
          <rect x="6.8" y="9.2" width="10.4" height="7" rx="2" ry="2" fill="#fff"/>
          <path d="M9.2 13.6v-2.2h1.8c.5 0 .9.4.9.9v1.3h1v-1.3c0-.5.4-.9.9-.9h1.8v2.2"
                fill="${brand}"/>
        </svg>
      </div>`;

    return L.divIcon({
      className: "shop-pin-wrap",
      html,
      iconSize: [SIZE, SIZE],
      iconAnchor: [SIZE / 2, SIZE],
      popupAnchor: [0, -SIZE],
    });
  }

  async setMarkers(items = [], { chunk = 80, delay = 8, size } = {}) {
    const L = window.L;
    if (!this.map) return [];

    // 既存をクリア
    (this._markers || []).forEach((m) => m.remove());
    this._markers = [];

    const layer = this.layer || (this.layer = L.layerGroup().addTo(this.map));

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const lat = it.__lat ?? it.lat;
      const lng = it.__lng ?? it.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const icon = this._makeShopIcon({ size }); // ← 正しい呼び出し
      const m = L.marker([lat, lng], { icon });
      m._boundData = it;
      if (this._markerClick) m.on("click", () => this._markerClick(it));
      m.addTo(layer);
      this._markers.push(m);

      if (chunk && (i % chunk === chunk - 1)) {
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    return this._markers;
  }

  fitToMarkers({ padding = 56, maxZoom = 16 } = {}) {
    const L = window.L;
    if (!this.map || !this._markers.length) return;
    const latlngs = this._markers.map((m) => m.getLatLng());
    const b = L.latLngBounds(latlngs);
    if (b.isValid()) this.map.fitBounds(b, { padding: [padding, padding], maxZoom });
  }

  addCurrentDot(lat, lng) {
    const L = window.L;
    if (!this.map) return;
    const layer = this.layer || (this.layer = L.layerGroup().addTo(this.map));
    if (!this.currentDot) {
      this.currentDot = L.circleMarker([lat, lng], {
        radius: 7,
        color: "#2a6ef0",
        weight: 2,
        fillColor: "#2a6ef0",
        fillOpacity: 1,
      }).addTo(layer);
    } else {
      this.currentDot.setLatLng([lat, lng]);
    }
    if (typeof this.currentDot.bringToFront === "function") this.currentDot.bringToFront();
  }

  setSearchMarker(lat, lng) {
    const L = window.L;
    if (!this.map) return;
    const layer = this.layer || (this.layer = L.layerGroup().addTo(this.map));
    if (!this.searchMarker) {
      this.searchMarker = L.circleMarker([lat, lng], {
        radius: 6,
        color: "#0e7aff",
        weight: 2,
        fillColor: "#0e7aff",
        fillOpacity: 0.9,
      }).addTo(layer);
    } else {
      this.searchMarker.setLatLng([lat, lng]);
    }
    if (typeof this.searchMarker.bringToFront === "function") this.searchMarker.bringToFront();
  }
}
