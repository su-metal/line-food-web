// web/js/map-adapter.js
// Leaflet / Google を差し替え可能にする簡易アダプタ（今回は Leaflet 実装）

export function createMapAdapter(provider = "leaflet") {
  return new LeafletAdapter();
}

/* ================= Leaflet Adapter ================ */
class LeafletAdapter {
  constructor() {
    this.map = null;
    this.layer = null;        // ベースのレイヤー（LayerGroup）
    this._markers = [];
    this._clickCb = null;
  }

  async init(containerId, { center = [35.681236, 139.767125], zoom = 14 } = {}) {
    if (!window.L) throw new Error("Leaflet not loaded");

    // マップ
    this.map = L.map(containerId, {
      preferCanvas: true,         // モバイルで高速化
      zoomControl: false,
      maxZoom: 19,
      attributionControl: true,
    }).setView(center, zoom);

    // タイル
    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
        crossOrigin: true,
      }
    ).addTo(this.map);

    // まとめ用レイヤ
    this.layer = L.layerGroup().addTo(this.map);

    return this;
  }

  /** ピンSVG（DivIcon 用） */
  _divIconFor(shop) {
    const color = "#0f5b4f"; // ブランド寄りの深緑
    const html = `
      <svg class="map-pin" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 22s-7-7.8-7-13a7 7 0 1 1 14 0c0 5.2-7 13-7 13z" fill="${color}"/>
        <circle cx="12" cy="9" r="3.2" fill="#fff"/>
      </svg>`;
    return L.divIcon({
      className: "lfw-pin", // 背景や枠を消すためのクラス
      html,
      iconSize: [28, 36],
      iconAnchor: [14, 34],   // 先端が地点に来るように
      popupAnchor: [0, -34],
    });
  }

  /** 複数マーカー追加。戻り値: Leaflet Layer の配列 */
  addMarkers(items = [], opts = {}) {
    const circleThreshold = opts.circleThreshold ?? 80; // 多い時は円
    const useCircles = items.length > circleThreshold;

    const created = [];
    for (const shop of items) {
      const lat = num(shop?.lat) ?? num(shop?.latitude) ?? num(shop?.lat_deg) ??
                  num(shop?.location?.lat) ?? num(shop?.coords?.lat) ?? num(shop?.geo?.lat);
      const lng = num(shop?.lng) ?? num(shop?.lon) ?? num(shop?.longitude) ?? num(shop?.lng_deg) ??
                  num(shop?.location?.lng) ?? num(shop?.location?.lon) ?? num(shop?.coords?.lng) ?? num(shop?.geo?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      let marker;
      if (useCircles) {
        // 速い円マーカー（でも必ずクリック可能に）
        marker = L.circleMarker([lat, lng], {
          radius: 7,
          color: "#0f5b4f",
          weight: 2,
          fillColor: "#0f5b4f",
          fillOpacity: 0.95,
          interactive: true,
        });
      } else {
        // 見た目が“ピン”の DivIcon
        marker = L.marker([lat, lng], {
          icon: this._divIconFor(shop),
          keyboard: false,
          riseOnHover: true,
          title: shop?.name || "",
        });
      }

      marker.addTo(this.layer);
      marker.on("click", () => {
        if (typeof this._clickCb === "function") this._clickCb(shop);
      });

      created.push(marker);
    }

    this._markers.push(...created);
    return created;
  }

  /** クリックハンドラ登録 */
  onMarkerClick(cb) {
    this._clickCb = cb;
  }

  /** 現在地など1点へ移動 */
  setCenter(lat, lng, zoom) {
    if (!this.map) return;
    this.map.setView([lat, lng], zoom ?? this.map.getZoom(), { animate: true });
  }

  /** マーカー群に合わせてズーム（パディング px 指定可） */
  fitToMarkers({ padding = 60 } = {}) {
    if (!this.map || !this._markers.length) return;
    const group = L.featureGroup(this._markers);
    this.map.fitBounds(group.getBounds(), {
      padding: L.point(padding, padding),
      animate: true,
    });
  }

  /** 任意の座標配列 [[lat,lng], ...] をフィット */
  fitToPoints(points = [], { padding = 60 } = {}) {
    if (!this.map || !points.length) return;
    const bounds = L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: L.point(padding, padding), animate: true });
    }
  }
}

/* ---- helpers ---- */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
