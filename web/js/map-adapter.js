// web/js/map-adapter.js
// Leaflet専用の薄いアダプタ（ESM）。Google等へ差し替えやすいAPIを統一。
// すでに HTML 側でこのファイルを <script type="module"> 直読みしないこと
// （shops-map.js から import するだけにすること）

const LCSS =
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LJS =
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/** LeafletのCSS/JSを未ロードなら動的ロード */
function ensureLeafletLoaded() {
  return new Promise((resolve, reject) => {
    if (window.L && window.L.map) return resolve(window.L);

    // CSS
    const hasCss = [...document.styleSheets].some((s) =>
      (s.href || "").includes("/leaflet.css")
    );
    if (!hasCss) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LCSS;
      document.head.appendChild(link);
    }

    // JS
    const s = document.createElement("script");
    s.src = LJS;
    s.async = true;
    s.onload = () => (window.L && window.L.map ? resolve(window.L) : reject(new Error("Leaflet load failed")));
    s.onerror = () => reject(new Error("Leaflet script error"));
    document.head.appendChild(s);
  });
}

/** 座標を色々なキー名から安全に取り出す */
function pickLatLng(item) {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const lat =
    num(item?.lat) ??
    num(item?.latitude) ??
    num(item?.location?.lat) ??
    num(item?.coords?.lat) ??
    null;
  const lng =
    num(item?.lng) ??
    num(item?.lon) ??
    num(item?.longitude) ??
    num(item?.location?.lng) ??
    num(item?.location?.lon) ??
    num(item?.coords?.lng) ??
    null;
  return [lat, lng];
}

export class LeafletAdapter {
  constructor() {
    this.map = null;
    this.layer = null;
    this.markers = [];
    this._onClick = null;
  }

  /** @param {string|HTMLElement} elOrId */
  async init(elOrId, { center = [35.681236, 139.767125], zoom = 14 } = {}) {
    const el =
      typeof elOrId === "string"
        ? document.getElementById(elOrId)
        : elOrId;
    if (!el) throw new Error("map container not found");

    const L = await ensureLeafletLoaded();

    this.map = L.map(el, { zoomControl: false }).setView(center, zoom);

    // OSM タイル
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(this.map);

    this.layer = L.layerGroup().addTo(this.map);
    return this;
  }

  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    this.map.setView([lat, lng], zoom ?? this.map.getZoom());
  }

  /** 1つのピンを追加 */
  addMarker(item, { icon } = {}) {
    if (!this.map || !window.L) return null;
    const [lat, lng] = pickLatLng(item);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const m = window.L
      .marker([lat, lng], icon ? { icon } : undefined)
      .addTo(this.layer);
    m.__payload = item;

    // 既にハンドラが設定されていればバインド
    if (this._onClick) m.on("click", () => this._onClick(item, m));

    this.markers.push(m);
    return m;
  }

  /** 複数ピンを一括追加（← shops-map.js が呼んでいる想定のAPI） */
  addMarkers(items = [], opts) {
    const created = [];
    for (const it of items) {
      const m = this.addMarker(it, opts);
      if (m) created.push(m);
    }
    return created;
  }

  /** クリックハンドラを後付け（既存ピンにも付け直す） */
  onMarkerClick(handler) {
    this._onClick = typeof handler === "function" ? handler : null;
    for (const m of this.markers) {
      m.off("click");
      if (this._onClick) m.on("click", () => this._onClick(m.__payload, m));
    }
  }

  /** 追加済みピンで地図をフィット */
  fitToMarkers({ padding = 40 } = {}) {
    if (!this.map || !this.markers.length || !window.L) return;
    const group = window.L.featureGroup(this.markers);
    this.map.fitBounds(group.getBounds(), {
      padding: [padding, padding],
      maxZoom: 17,
    });
  }

  /** 全ピン削除 */
  clearMarkers() {
    if (this.layer) this.layer.clearLayers();
    this.markers.length = 0;
  }
}

/** 将来 Google などに差し替える入口 */
export function createMapAdapter(kind = "leaflet") {
  if (kind !== "leaflet") {
    throw new Error("Only 'leaflet' is supported for now");
  }
  return new LeafletAdapter();
}
