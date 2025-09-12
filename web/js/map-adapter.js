// web/js/map-adapter.js
// Leaflet / Google を差し替え可能なアダプタ（今回は Leaflet 実装のみ）

export function createMapAdapter(kind = "leaflet") {
  if (kind !== "leaflet") kind = "leaflet";
  return new LeafletAdapter();
}

class LeafletAdapter {
  constructor() {
    this.map = null;
    this.layer = null;        // FeatureGroup (markers 用)
    this._clickCb = null;
    this._markers = [];
    this.currentDot = null;
    this.searchMarker = null;
    this._shopIcon = null;    // ← 明示サイズの DivIcon を用意
  }

  /* サイトカラーのショップアイコン（明示サイズ） */
  _makeShopIcon() {
    if (!this._shopIcon) {
      const SVG =
        `<svg viewBox="0 0 24 24" aria-hidden="true" style="display:block;width:100%;height:100%;color:var(--accent,#0e5d45)">
           <g fill="currentColor">
             <path d="M12 2c-3.9 0-7 2.9-7 6.5 0 4.7 6.2 11.8 6.5 12.1a.9.9 0 0 0 1 .0C12.8 20.3 19 13.2 19 8.5 19 4.9 15.9 2 12 2zM9 7h6a1 1 0 0 1 1 1v5h-2v-2H10v2H8V8a1 1 0 0 1 1-1zM10 9v1h4V9h-4z"/>
           </g>
         </svg>`;
      // 明示サイズ・アンカーを指定（CSS無しでも必ず表示）
      this._shopIcon = window.L.divIcon({
        className: "shop-marker",
        html: SVG,
        iconSize: [30, 30],
        iconAnchor: [15, 30],   // 底辺中央
        popupAnchor: [0, -30]
      });
    }
    return this._shopIcon;
  }

  async init(containerId, { center = [35.681236, 139.767125], zoom = 13 } = {}) {
    if (!window.L) throw new Error("Leaflet not loaded");
    // ベースマップ
    this.map = window.L.map(containerId, {
      zoomControl: false,
      attributionControl: true
    }).setView(center, zoom);

    window.L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }
    ).addTo(this.map);

    this.layer = window.L.featureGroup().addTo(this.map);
  }

  /* マーカーを差し替え（高速化のため分割追加に対応） */
  async setMarkers(items = [], { chunk = 80, delay = 8 } = {}) {
    if (!this.map) return;
    const L = window.L;
    const icon = this._makeShopIcon();

    // 既存マーカー削除
    this._markers.forEach(m => m.remove());
    this._markers = [];

    // 追加
    for (let i = 0; i < items.length; i += chunk) {
      const part = items.slice(i, i + chunk);
      for (const it of part) {
        const lat = Number(it.__lat), lng = Number(it.__lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const m = L.marker([lat, lng], {
          icon,
          keyboard: false,
          riseOnHover: true,
          zIndexOffset: 100   // タイルより前面に
        }).addTo(this.layer);

        m._shop = it;
        m.on("click", () => this._clickCb?.(it));
        this._markers.push(m);
      }
      if (delay) await new Promise(r => setTimeout(r, delay));
    }
    return this._markers;
  }

  onMarkerClick(cb) { this._clickCb = cb; }

  fitToMarkers({ padding = 56, maxZoom = 16 } = {}) {
    if (!this._markers.length) return;
    const L = window.L;
    const b = L.latLngBounds(this._markers.map(m => m.getLatLng()));
    if (b.isValid()) this.map.fitBounds(b, { padding: [padding, padding], maxZoom });
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    if (Number.isFinite(zoom)) this.map.setView([lat, lng], zoom);
    else this.map.panTo([lat, lng]);
  }

  addCurrentDot(lat, lng) {
    const L = window.L;
    if (!this.currentDot) {
      this.currentDot = L.circleMarker([lat, lng], {
        radius: 6, color: "#2a6ef0", weight: 2, fillColor: "#2a6ef0", fillOpacity: 1
      }).addTo(this.layer);
    } else {
      this.currentDot.setLatLng([lat, lng]);
    }
  }

  /* 検索地点の単発マーカー（更新可能） */
  setSearchMarker(lat, lng) {
    const L = window.L;
    if (!this.searchMarker) {
      this.searchMarker = L.circleMarker([lat, lng], {
        radius: 6, color: "#0e5d45", weight: 2, fillColor: "#0e5d45", fillOpacity: 1
      }).addTo(this.layer);
    } else {
      this.searchMarker.setLatLng([lat, lng]); // bringToFront は不要（モバイル互換）
    }
  }
}
