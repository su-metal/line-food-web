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
  // LeafletAdapter 内
_makeShopIcon(size = 32, color) {
  const col = color || brandColor();                 // ピンの塗り（--brand）
  const S = Math.round(Math.max(24, Math.min(64, Number(size) || 32))); // 横幅
  const H = Math.round(S * 1.42);                    // 高さ（先端まで）
  const stroke = "#ffffff";                           // 縁取り（白）

  // viewBoxは固定（64x88）。実サイズは iconSize で縮尺。
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

  <!-- ドロップ型ピン本体 -->
  <path d="M32 4C19.8 4 9.9 13.9 9.9 26.1c0 18 22.1 36.9 22.1 36.9S54.1 44.1 54.1 26.1C54.1 13.9 44.2 4 32 4Z"
        fill="${col}" stroke="${stroke}" stroke-width="4" filter="url(#pinDrop)"/>

  <!-- 店舗グリフ（オーニング＋建屋＋ドア＋窓） -->
  <g transform="translate(8,16)" fill="${stroke}">
    <!-- オーニングの帯 -->
    <rect x="1" y="0" width="46" height="8" rx="2"/>
    <!-- オーニングの垂れ（5連の半円） -->
    <g transform="translate(1,8)">
      <path d="M0 0h8a4 4 0 0 1-8 0Z"/>
      <path d="M9 0h8a4 4 0 0 1-8 0Z"/>
      <path d="M18 0h8a4 4 0 0 1-8 0Z"/>
      <path d="M27 0h8a4 4 0 0 1-8 0Z"/>
      <path d="M36 0h8a4 4 0 0 1-8 0Z"/>
    </g>
    <!-- 建屋躯体 -->
    <rect x="1" y="16" width="46" height="20" rx="3"/>
    <!-- ドア -->
    <rect x="7" y="18" width="10" height="16" rx="2"/>
    <!-- 窓 -->
    <rect x="22" y="18" width="20" height="12" rx="2"/>
  </g>
</svg>`.trim();

  const url = "data:image/svg+xml;utf8," + encodeURIComponent(svg);

  return window.L.icon({
    iconUrl: url,
    iconSize: [S, H],
    iconAnchor: [Math.round(S / 2), H - 2],  // 先端を座標に一致
    className: "pin-shop"
  });
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
