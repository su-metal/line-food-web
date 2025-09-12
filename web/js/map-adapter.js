// web/js/map-adapter.js
// Leaflet 用アダプタ（ESM）。Google 等に差し替えやすい共通APIを提供。

const LCSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LJS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

/** LeafletのCSS/JSを未ロードなら動的ロード */
function ensureLeafletLoaded() {
  return new Promise((resolve, reject) => {
    if (window.L && window.L.map) return resolve(window.L);

    // CSS（未挿入なら追加）
    const hasCss = [...document.styleSheets].some(s =>
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
    s.onload = () =>
      (window.L && window.L.map)
        ? resolve(window.L)
        : reject(new Error("Leaflet load failed"));
    s.onerror = () => reject(new Error("Leaflet script error"));
    document.head.appendChild(s);
  });
}

/** 数値化（失敗時は null） */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 座標を多様なキー名から抽出 */
function pickLatLng(item) {
  const lat =
    num(item?.lat) ??
    num(item?.latitude) ??
    num(item?.lat_deg) ??
    num(item?.location?.lat) ??
    num(item?.coords?.lat) ??
    num(item?.geo?.lat) ??
    null;

  const lng =
    num(item?.lng) ??
    num(item?.lon) ??
    num(item?.longitude) ??
    num(item?.lng_deg) ??
    num(item?.location?.lng) ??
    num(item?.location?.lon) ??
    num(item?.coords?.lng) ??
    num(item?.geo?.lng) ??
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
    const el = typeof elOrId === "string" ? document.getElementById(elOrId) : elOrId;
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

  /** 単体マーカー */
  addMarker(item, { icon } = {}) {
    if (!this.map || !window.L) return null;
    const [lat, lng] = pickLatLng(item);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const m = window.L.marker([lat, lng], icon ? { icon } : undefined).addTo(this.layer);
    m.__payload = item;

    if (this._onClick) m.on("click", () => this._onClick(item, m));
    this.markers.push(m);
    return m;
  }

  /** 複数マーカー（shops-map.js が使う想定API） */
  addMarkers(items = [], opts) {
    const created = [];
    for (const it of items) {
      const m = this.addMarker(it, opts);
      if (m) created.push(m);
    }
    return created;
  }

  /** クリックハンドラ（後からでも既存マーカーへ付け替え） */
  onMarkerClick(handler) {
    this._onClick = typeof handler === "function" ? handler : null;
    for (const m of this.markers) {
      m.off?.("click");
      if (this._onClick) m.on?.("click", () => this._onClick(m.__payload, m));
    }
  }

  /** すべてのマーカーが入るようにフィット */
  fitToMarkers({ padding = 40 } = {}) {
    if (!this.map || !this.markers.length || !window.L) return;
    const group = window.L.featureGroup(this.markers);
    const bounds = group.getBounds();
    if (!bounds || !bounds.isValid?.()) return; // 無効なら何もしない
    this.map.fitBounds(bounds, {
      padding: [padding, padding],
      maxZoom: 17,
    });
  }

  /**
   * Leaflet の fitBounds 互換 + エイリアス動作
   * - 境界（[[lat,lng],[lat,lng]] など）を渡されたらそのまま適用
   * - 「オプションのみ（{padding:40} など）」や引数なしなら、全マーカーへフィット
   */
  fitBounds(boundsOrOpts, maybeOpts) {
    const L = window.L;
    // 1) 引数なし → 全マーカー
    if (!boundsOrOpts) {
      this.fitToMarkers(maybeOpts || {});
      return;
    }

    // 2) オプションだけ来たケース（shops-map.js でありがち）
    const isOptionsOnly =
      typeof boundsOrOpts === "object" &&
      !Array.isArray(boundsOrOpts) &&
      (("padding" in boundsOrOpts) || ("maxZoom" in boundsOrOpts) || ("animate" in boundsOrOpts));

    if (isOptionsOnly) {
      this.fitToMarkers(boundsOrOpts);
      return;
    }

    // 3) 明示的な境界（配列 or LatLngBounds-like）
    if (Array.isArray(boundsOrOpts) && L) {
      try {
        const b = L.latLngBounds(boundsOrOpts);
        if (b.isValid?.()) {
          this.map.fitBounds(b, maybeOpts || {});
          return;
        }
      } catch { /* fallthrough */ }
    } else if (boundsOrOpts && boundsOrOpts.isValid?.()) {
      this.map.fitBounds(boundsOrOpts, maybeOpts || {});
      return;
    }

    // 4) 最後の砦：全マーカー
    this.fitToMarkers(maybeOpts || {});
  }

  clearMarkers() {
    if (this.layer) this.layer.clearLayers();
    this.markers.length = 0;
  }
}

/** 将来の差し替え入口（Google等） */
export function createMapAdapter(kind = "leaflet") {
  if (kind !== "leaflet") throw new Error("Only 'leaflet' is supported for now");
  return new LeafletAdapter();
}

/** 互換エイリアス（過去の import 名対策） */
export const createAdapter = createMapAdapter;
