// web/js/map-adapter.js
// Leaflet 専用の軽量アダプタ。あとで Google に差し替える場合もこのAPIを保てばOK。

export function createMapAdapter(kind = "leaflet") {
  return new LeafletAdapter();
}

// ---- Leaflet 実装 ----
class LeafletAdapter {
  constructor() {
    this.map = null;
    this._markers = [];
    this._clickCb = null;
  }

  async init(containerId, { center = [35.681236, 139.767125], zoom = 14 } = {}) {
    if (!window.L) throw new Error("Leaflet not loaded");
    // ズームUIは地図の既存UIに任せる（必要なら true）
    this.map = L.map(containerId, { zoomControl: false }).setView(center, zoom);

    // OSM タイル
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(this.map);

    return this;
  }

  // 多様なキー名から座標を拾う
  _pickLatLng(obj) {
    const n = (v) => {
      const x = Number(v);
      return Number.isFinite(x) ? x : null;
    };
    const lat =
      n(obj?.lat) ??
      n(obj?.latitude) ??
      n(obj?.lat_deg) ??
      n(obj?.location?.lat) ??
      n(obj?.coords?.lat) ??
      n(obj?.geo?.lat);
    const lng =
      n(obj?.lng) ??
      n(obj?.lon) ??
      n(obj?.longitude) ??
      n(obj?.lng_deg) ??
      n(obj?.location?.lng) ??
      n(obj?.location?.lon) ??
      n(obj?.coords?.lng) ??
      n(obj?.geo?.lng);
    return [lat, lng];
  }

  addMarkers(items = []) {
    if (!this.map) throw new Error("init() してから呼んでください");
    const created = [];
    items.forEach((shop) => {
      const [lat, lng] = this._pickLatLng(shop);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const m = L.marker([lat, lng]).addTo(this.map);
      m._shop = shop;
      m.on("click", () => this._clickCb && this._clickCb(shop));
      this._markers.push(m);
      created.push(m);
    });
    return created;
  }

  onMarkerClick(cb) {
    this._clickCb = cb;
  }

  fitToMarkers({ padding = 60, maxZoom = 17 } = {}) {
    const pts = this._markers.map((m) => m.getLatLng());
    if (!pts.length) return;
    const b = L.latLngBounds(pts);
    this.map.fitBounds(b, { padding: [padding, padding], maxZoom });
  }

  // 任意の点群（[lat,lng] or {lat,lng}）で画面フィット
  fitToPoints(points = [], { padding = 60, maxZoom = 17 } = {}) {
    const pts = points
      .map((p) =>
        Array.isArray(p)
          ? L.latLng(p[0], p[1])
          : p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
          ? L.latLng(p.lat, p.lng)
          : null
      )
      .filter(Boolean);
    if (!pts.length) return;
    const b = L.latLngBounds(pts);
    this.map.fitBounds(b, { padding: [padding, padding], maxZoom });
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    this.map.setView([lat, lng], zoom ?? this.map.getZoom());
  }

  // 現在地から最寄りピンを返す
  getNearest(lat, lng) {
    if (!this._markers.length) return null;
    const here = L.latLng(lat, lng);
    let best = null;
    let bestD = Infinity;
    this._markers.forEach((m) => {
      const d = here.distanceTo(m.getLatLng());
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    });
    return best
      ? { marker: best, shop: best._shop, latlng: best.getLatLng(), distance_m: bestD }
      : null;
  }

  get markerCount() {
    return this._markers.length;
  }
}
