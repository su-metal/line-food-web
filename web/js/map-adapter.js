// web/js/map-adapter.js  ← まるごと置き換え
export function createMapAdapter(kind = "leaflet") {
  return new LeafletAdapter();
}

/* CSS変数 --brand を優先、無ければ既定色 */
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
    // マーカー用とオーバーレイ用を分離（現在地・検索ドットは overlay に載せる）
    this.layerMarkers  = null;
    this.layerOverlay  = null;
    // 互換：旧コードが参照しても動くように markers を layer にエイリアス
    this.layer = null;

    this._markers   = [];
    this._onClick   = null;
    this._currentDot   = null;
    this._searchMarker = null;

    // 端末に応じた既定ピンサイズ
    try {
      this.defaultPinPx =
        (typeof window !== "undefined" &&
          window.matchMedia &&
          window.matchMedia("(max-width:480px)").matches)
          ? 36   // SP
          : 32;  // PC
    } catch {
      this.defaultPinPx = 32;
    }
  }

  async init(elId = "map", { center = [35.681236, 139.767125], zoom = 13 } = {}) {
    const L = window.L;
    if (!L) throw new Error("Leaflet not loaded");

    this.map = L.map(elId, { zoomControl: false, attributionControl: true }).setView(center, zoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    this.layerMarkers = L.layerGroup().addTo(this.map);
    this.layerOverlay = L.layerGroup().addTo(this.map);
    // 互換
    this.layer = this.layerMarkers;

    L.control.zoom({ position: "bottomright" }).addTo(this.map);
  }

  /* 店舗マーカーを全入れ替え。size はピン幅(px) */
  async setMarkers(items = [], { size, color } = {}) {
    const L = window.L;
    if (!this.map || !this.layerMarkers) return;

    // 既存マーカーのみクリア（現在地・検索ドットは残す）
    this.layerMarkers.clearLayers();
    this._markers = [];

    const icon = this._makeShopIcon(size ?? this.defaultPinPx, color || brandColor());

    items.forEach((it) => {
      const la = Number(it.__lat ?? it.lat);
      const lo = Number(it.__lng ?? it.lng ?? it.lon);
      if (!Number.isFinite(la) || !Number.isFinite(lo)) return;

      const m = L.marker([la, lo], { icon }).addTo(this.layerMarkers);
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

  /* 現在地ドット（overlay に載せるので setMarkers() で消えない） */
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
    }).addTo(this.layerOverlay || this.map);
  }

  /* 検索地点の小ドット（同じく overlay） */
  setSearchMarker(lat, lng) {
    const L = window.L;
    if (!this.map) return;
    if (!this._searchMarker) {
      this._searchMarker = L.circleMarker([lat, lng], {
        radius: 7,
        color: "#2a6ef0",
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
      }).addTo(this.layerOverlay || this.map);
    } else {
      this._searchMarker.setLatLng([lat, lng]);
    }
  }

  /* --- 店舗ピン SVG（“白い長方形”を廃止。線画グリフで塗りつぶし無し） --- */
  _makeShopIcon(size = 32, color) {
    const col = color || brandColor();
    const S = Math.round(Math.max(24, Math.min(72, Number(size) || 32))); // 幅
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
        fill="${col}" stroke="${stroke}" stroke-width="3" filter="url(#pinDrop)"/>

  <!-- 店舗グリフ（線画） -->
  <g transform="translate(12,18)" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <!-- ひさし -->
    <path d="M0 14c7-8 33-8 40 0"/>
    <path d="M0 14h40"/>
    <!-- 本体枠 -->
    <rect x="1.5" y="16" width="37" height="22" rx="3"/>
    <!-- ドア＋窓 -->
    <rect x="7" y="20" width="8" height="12" rx="1.5"/>
    <rect x="22" y="20" width="10" height="6" rx="1.5"/>
    <!-- 小窓（丸） -->
    <circle cx="10.5" cy="28" r="1.8"/>
    <circle cx="20.0" cy="28" r="1.8"/>
    <circle cx="29.5" cy="28" r="1.8"/>
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
