// web/js/map-adapter.js
// すでにある export はそのまま。LeafletAdapter を以下の内容に差し替え。

class LeafletAdapter {
  constructor() {
    this.map = null;
    this.markers = [];
    this._onClick = null;
    this.markersLayer = null; // 店舗マーカー用
    this.miscLayer = null;    // 現在地ドットなど雑レイヤー
    this.meMarker = null;     // 現在地マーカー保持
  }

  async init(containerId, { center = [35.681236, 139.767125], zoom = 14 } = {}) {
    const L = window.L;
    if (!L) throw new Error("Leaflet not loaded");

    this.map = L.map(containerId, { zoomControl: false, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    // レイヤーを分離（店舗と現在地を別管理）
    this.markersLayer = L.layerGroup().addTo(this.map);
    this.miscLayer = L.layerGroup().addTo(this.map);

    this.map.setView(center, zoom);
  }

  clearMarkers() {
    this.markersLayer?.clearLayers();
    this.markers = [];
  }

  /**
   * 店舗マーカーを高速追加（円マーカー）
   * items: { __lat, __lng, ... } を想定
   */
  async addMarkers(items = [], { chunk = 0, delay = 0 } = {}) {
    const L = window.L;
    const addOne = (s) => {
      const m = L.circleMarker([s.__lat, s.__lng], {
        radius: 8,
        color: "#154f3e",
        weight: 2,
        fillColor: "#0e7b61",
        fillOpacity: 0.9,
        pane: "markerPane"
      }).addTo(this.markersLayer);
      m.on("click", () => this._onClick?.(s));
      this.markers.push(m);
    };

    if (!chunk || chunk <= 0) {
      items.forEach(addOne);
    } else {
      for (let i = 0; i < items.length; i += chunk) {
        items.slice(i, i + chunk).forEach(addOne);
        if (delay) await new Promise((r) => setTimeout(r, delay));
      }
    }
    return this.markers;
  }

  async setMarkers(items = [], opts = {}) {
    this.clearMarkers();
    return this.addMarkers(items, opts);
  }

  onMarkerClick(handler) {
    this._onClick = handler;
  }

  fitToMarkers({ padding = 56, maxZoom = 17 } = {}) {
    const L = window.L;
    if (!this.markers.length) return;
    const b = L.latLngBounds(this.markers.map((m) => m.getLatLng()));
    if (b.isValid()) this.map.fitBounds(b, { padding: [padding, padding], maxZoom });
  }

  setCenter(lat, lng, zoom) {
    this.map.setView([lat, lng], zoom ?? this.map.getZoom());
  }

  /**
   * 現在地の青ドットを表示（前のものは置き換え）
   */
  addCurrentDot(lat, lng) {
    const L = window.L;
    if (this.meMarker) this.miscLayer.removeLayer(this.meMarker);

    // 視認性の高い DivIcon
    const icon = L.divIcon({
      className: "me-marker",
      html: '<span class="me-dot" aria-hidden="true"></span>',
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    this.meMarker = L.marker([lat, lng], { icon, interactive: false });
    this.miscLayer.addLayer(this.meMarker);
    return this.meMarker;
  }
}

// 既存の createMapAdapter から LeafletAdapter を返す実装はそのまま
export function createMapAdapter(kind = "leaflet") {
  return new LeafletAdapter();
}
