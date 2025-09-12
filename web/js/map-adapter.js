// web/js/map-adapter.js
// Leaflet adapter: fast-first-paint & chunked markers
const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
const SAVE_DATA = !!(conn && conn.saveData);
const SLOW_NET = !!(conn && /(^|-)2g/.test(conn.effectiveType || ""));

export function createMapAdapter(kind = "leaflet") {
  if (kind !== "leaflet") throw new Error("Only Leaflet adapter is provided");
  return new LeafletAdapter();
}

class LeafletAdapter {
  constructor() {
    this.map = null;
    this.layer = null;        // markers layer
    this._markers = [];
    this._onClick = null;
  }

  async init(elId, { center = [35.681236, 139.767125], zoom = 13 } = {}) {
    if (!window.L) {
      // 動的ロードが必要な場合だけ（shops.htmlでCDN読み込み済みなら通らない）
      await import("https://unpkg.com/leaflet@1.9.4/dist/leaflet-src.esm.js");
    }

    const L = window.L;
    this.map = L.map(elId, {
      preferCanvas: true,                // ← 軽い
      zoomControl: false,                // 自前UIなら消す
      zoomAnimation: false,              // 初期体験を軽く
      markerZoomAnimation: false,
      fadeAnimation: true,
      inertia: true,
      worldCopyJump: true
    }).setView(center, zoom);

    // 軽めタイル（Retinaを抑制 / keepBuffer縮小）
    const retina = !(SAVE_DATA || SLOW_NET); // 低速/節約ならretina無効
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors',
      crossOrigin: true,
      detectRetina: retina,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1,              // ← 既定2→1（スクロール時の再描画を軽く）
      tileSize: 256,
      maxZoom: 19,
      subdomains: "abc"
    }).addTo(this.map);

    this.layer = L.layerGroup().addTo(this.map);
    return this;
  }

  // 一括置き換え（古いマーカーは破棄）
  async setMarkers(items = [], { chunk = 60, delay = 16 } = {}) {
    this.clearMarkers();
    return this.addMarkers(items, { chunk, delay });
  }

  // 追加入力（チャンク分割で分割描画）
  async addMarkers(items = [], { chunk = 60, delay = 16 } = {}) {
    if (!Array.isArray(items) || !items.length) return [];

    const L = window.L;
    const batch = (arr, n) => {
      const out = [];
      for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
      return out;
    };

    const batches = batch(items, chunk);
    for (const group of batches) {
      for (const it of group) {
        const lat = Number(it.__lat ?? it.lat);
        const lng = Number(it.__lng ?? it.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        // PNGマーカーより軽い circleMarker を採用
        const m = L.circleMarker([lat, lng], {
          radius: 7,
          weight: 2,
          color: "#1a3a2d",
          fillColor: "#1a3a2d",
          fillOpacity: 1
        });
        m._shop = it;
        m.addTo(this.layer);
        if (this._onClick) m.on("click", () => this._onClick(it));
        this._markers.push(m);
      }
      // フレームを解放（小刻みに描画）
      await new Promise((r) => setTimeout(r, delay));
    }
    return this._markers.slice();
  }

  onMarkerClick(cb) {
    this._onClick = typeof cb === "function" ? cb : null;
  }

  clearMarkers() {
    if (!this.layer) return;
    this.layer.clearLayers();
    this._markers = [];
  }

  fitToMarkers({ padding = 60, maxZoom = 16 } = {}) {
    if (!this.map) return;
    if (!this._markers.length) return;

    const L = window.L;
    const bounds = L.latLngBounds(
      this._markers.map((m) => m.getLatLng())
    );
    if (!bounds.isValid()) return;
    this.map.fitBounds(bounds, { padding: [padding, padding], maxZoom });
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    if (Number.isFinite(zoom)) this.map.setView([lat, lng], zoom, { animate: true });
    else this.map.panTo([lat, lng], { animate: true });
  }

  addCurrentDot(lat, lng) {
    const L = window.L;
    const me = L.circleMarker([lat, lng], {
      radius: 7, color: "#2a6ef0", weight: 2, fillColor: "#2a6ef0", fillOpacity: 1
    }).addTo(this.layer);
    this._markers.push(me);
    return me;
  }
}
