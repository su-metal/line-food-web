// web/js/map-adapter.js  ← まるごと置き換え
/* Leaflet 専用アダプタ。Googleへ差し替える場合も同じ I/F を維持 */
export function createMapAdapter(kind = "leaflet") {
  return new LeafletAdapter();
}

/* --- 共通ユーティリティ（色など） --- */
function brandColor() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--brand");
    return (v && v.trim()) || "#0d5c51";
  } catch {
    return "#0d5c51";
  }
}

class LeafletAdapter {
  constructor() {
    this.map = null;
    this.layer = null;
    this._markers = [];
    this._onClick = null;
    this._currentDot = null;
    this._searchMarker = null;
  }

  async init(elId = "map", { center = [35.681236, 139.767125], zoom = 13 } = {}) {
    const L = window.L;
    if (!L) throw new Error("Leaflet not loaded");
    this.map = L.map(elId, { zoomControl: false, attributionControl: true }).setView(center, zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    this.layer = L.layerGroup().addTo(this.map);
    L.control.zoom({ position: "bottomright" }).addTo(this.map);
  }

  /* マーカーを全入れ替え。size はピンの幅(px) */
  async setMarkers(items = [], { size = 30, color } = {}) {
    const L = window.L;
    if (!this.map || !this.layer) return;

    // 既存をクリア
    this.layer.clearLayers();
    this._markers = [];

    const icon = this._makeShopIcon(size, color || brandColor());

    items.forEach((it) => {
      const la = Number(it.__lat ?? it.lat);
      const lo = Number(it.__lng ?? it.lng ?? it.lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return;

      const m = L.marker([la, lo], { icon }).addTo(this.layer);
      m.__data = it;
      m.on("click", () => this._onClick && this._onClick(it));
      this._markers.push(m);
    });
  }

  onMarkerClick(cb) { this._onClick = cb; }

  fitToMarkers({ padding = 56, maxZoom = 17 } = {}) {
    const L = window.L;
    if (!this._markers.length) return;
    const b = L.latLngBounds(this._markers.map((m) => m.getLatLng()));
    if (b.isValid()) this.map.fitBounds(b, { padding: [padding, padding], maxZoom });
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    this.map.setView([lat, lng], zoom ?? this.map.getZoom(), { animate: true });
  }

  addCurrentDot(lat, lng, { radius = 9 } = {}) {
    const L = window.L;
    if (!this.map) return;
    if (this._currentDot) this._currentDot.remove();
    this._currentDot = L.circleMarker([lat, lng], {
      radius,
      color: "#2a6ef0",
      weight: 2,
      fillColor: "#2a6ef0",
      fillOpacity: 1,
    }).addTo(this.layer || this.map);
  }

  setSearchMarker(lat, lng) {
    const L = window.L;
    if (!this.map) return;
    if (!this._searchMarker) {
      this._searchMarker = L.circleMarker([lat, lng], {
        radius: 7, color: "#2a6ef0", weight: 2, fillColor: "#ffffff", fillOpacity: 1,
      }).addTo(this.layer || this.map);
    } else {
      this._searchMarker.setLatLng([lat, lng]);
    }
  }

  /* === ここが“店舗ピン”の生成。必ず this._makeShopIcon を使う === */
  _makeShopIcon(size = 30, color) {
    const col = color || brandColor();
    const S = Math.round(Math.max(24, Math.min(64, Number(size) || 30))); // 横幅
    const H = Math.round(S * 1.42);                                       // 高さ
    const stroke = "#ffffff";

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 88" aria-hidden="true">
  <defs>
    <filter id="pinDrop" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2"/>
      <feOffset dy="0.8"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <!-- ピン本体 -->
  <path d="M32 4C19.8 4 9.9 13.9 9.9 26.1c0 18 22.1 36.9 22.1 36.9S54.1 44.1 54.1 26.1C54.1 13.9 44.2 4 32 4Z"
        fill="${col}" stroke="${stroke}" stroke-width="4" filter="url(#pinDrop)"/>
  <!-- 店舗グリフ -->
  <g transform="translate(8,16)" fill="${stroke}">
    <rect x="1" y="0" width="46" height="8" rx="2"/>
    <g transform="translate(1,8)">
      <path d="M0 0h8a4 4 0 0 1-8 0Z"/>
      <path d="M9 0h8a4 4 0 0 1-8 0Z"/>
      <path d="M18 0h8a4 4 0 0 1-8 0Z"/>
      <path d="M27 0h8a4 4 0 0 1-8 0Z"/>
      <path d="M36 0h8a4 4 0 0 1-8 0Z"/>
    </g>
    <rect x="1" y="16" width="46" height="20" rx="3"/>
    <rect x="7" y="18" width="10" height="16" rx="2"/>
    <rect x="22" y="18" width="20" height="12" rx="2"/>
  </g>
</svg>`.trim();

    const url = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    return window.L.icon({
      iconUrl: url,
      iconSize: [S, H],
      iconAnchor: [Math.round(S / 2), H - 2],
      className: "pin-shop",
    });
  }
}

