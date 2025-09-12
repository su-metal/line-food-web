// web/js/map-adapter.js
// ES Module。HTMLから直接読み込まず、shops-map.js から import してください。
// 例）import { createMapAdapter } from './map-adapter.js';

/* ---------- Leaflet CSS（保険で自動注入） ---------- */
function ensureLeafletCss() {
  if (document.querySelector('link[data-leaflet-css]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  link.setAttribute('data-leaflet-css', '');
  document.head.appendChild(link);
}

/* ================= Leaflet adapter ================= */
class LeafletAdapter {
  constructor() {
    this.map = null;
    this.markers = new Map();
  }

  async init(container, center, zoom, options = {}) {
    ensureLeafletCss();

    // Leaflet の地図生成
    this.map = L.map(container, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    // タイル（デフォルトは OpenStreetMap）
    L.tileLayer(
      options.tileUrl || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      {
        maxZoom: 19,
        attribution:
          options.attribution || '&copy; OpenStreetMap contributors',
      }
    ).addTo(this.map);

    // レイアウト確定後にサイズ再計算（白画面防止）
    setTimeout(() => this.map.invalidateSize(), 0);
  }

  addMarker({ lat, lng }, { id, title, onClick, icon } = {}) {
    const m = L.marker([lat, lng], icon ? { icon } : undefined).addTo(this.map);
    if (title) m.bindTooltip(title);
    if (onClick) m.on('click', () => onClick(id));
    const key = id ?? m._leaflet_id;
    this.markers.set(key, m);
    return key;
  }

  flyTo({ lat, lng }, zoom) {
    this.map.flyTo([lat, lng], zoom ?? this.map.getZoom(), { duration: 0.6 });
  }

  setCenter({ lat, lng }, zoom) {
    this.map.setView([lat, lng], zoom ?? this.map.getZoom());
  }

  fitBounds(bounds) {
    this.map.fitBounds(bounds);
  }
}

/* ================= Google adapter（後で実装予定） ================= */
class GoogleAdapter {
  async init() {
    throw new Error('Google Maps はこのビルドでは無効です（Leaflet を使用）');
  }
}

/* ---------- factory ---------- */
export function createMapAdapter(engine = 'leaflet') {
  return engine === 'google' ? new GoogleAdapter() : new LeafletAdapter();
}
