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
        radius: 9,
        color: "#b38b59",
        weight: 2,
        fillColor: "#ffffff",
        fillOpacity: 1,
      }).addTo(this.layerOverlay || this.map);
    } else {
      this._searchMarker.setLatLng([lat, lng]);
    }
  }

   /* --- シンプルピン（ブランド色のしずく形＋白い芯） --- */
  _makeShopIcon(size = 32, color) {
    const col = color || brandColor();

    // 横幅 S を入力、縦比は 44:32（一般的なピン比率）
    const S = Math.round(Math.max(20, Math.min(72, Number(size) || 32))); // 幅
    const H = Math.round(S * 44 / 32);                                     // 高さ
    const stroke = "#ffffff";

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 44" aria-hidden="true">
  <defs>
    <filter id="pinShadow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.2"/>
      <feOffset dy="0.8"/>
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .22 0"/>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <!-- しずく形のピン（塗り＝ブランド色／白縁あり） -->
  <path d="M16 2C8.82 2 3 7.82 3 15c0 9.6 13 19 13 19s13-9.4 13-19C29 7.82 23.18 2 16 2Z"
        fill="${col}" stroke="${stroke}" stroke-width="3" filter="url(#pinShadow)"/>

  <!-- 中央の白い芯（控えめ） -->
  <circle cx="16" cy="15" r="5.2" fill="#ffffff" opacity="0.95"/>
</svg>`.trim();

    const url = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
    return window.L.icon({
      iconUrl: url,
      iconSize: [S, H],
      iconAnchor: [Math.round(S / 2), H - 2], // 先端が指すように下端へ
      className: "pin-shop",
    });
  }

}
