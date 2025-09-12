// web/js/map-adapter.js
// Leaflet / Google を差し替え可能なアダプタ（今回は Leaflet 実装のみ）

export function createMapAdapter(kind = "leaflet") {
  if (kind !== "leaflet") kind = "leaflet";
  return new LeafletAdapter();
}

class LeafletAdapter {
  constructor() {
    this.map = null;
    this.layer = null; // FeatureGroup (markers 用)
    this._clickCb = null;
    this._markers = [];
    this.currentDot = null;
    this.searchMarker = null;
    this._shopIcon = null; // ← 明示サイズの DivIcon を用意
  }

  /* サイトカラーのショップアイコン（明示サイズ） */
  // === カスタム：ショップピン（DPR対応・サイトカラー） ===
  _mkShopIcon() {
    if (this._iconShop) return this._iconShop;

    const root = document.documentElement;
    // サイトカラー（--accent が無ければ --brand、それも無ければ既定色）
    const css = getComputedStyle(root);
    const brand = (
      css.getPropertyValue("--accent") ||
      css.getPropertyValue("--brand") ||
      "#0B5C3D"
    ).trim();

    // デバイスピクセル比に応じて拡大（上限2x）
    const DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const W = Math.round(34 * DPR); // 横
    const H = Math.round(44 * DPR); // 縦（ティアドロップの高さ）

    // 角丸ティアドロップ + 「店」風の簡易アイコン
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 34 44" aria-hidden="true">
       <path d="M17 0c8.8 0 16 6.9 16 15.5 0 10.3-12.2 22.6-15.1 25.5a1.3 1.3 0 0 1-1.8 0C13.2 38.1 1 25.8 1 15.5 1 6.9 8.2 0 17 0Z" fill="${brand}"/>
       <rect x="9" y="10" width="16" height="10" rx="2" ry="2" fill="#fff"/>
       <rect x="12" y="13" width="4" height="7" rx="1" fill="${brand}"/>
       <rect x="18" y="13" width="4" height="7" rx="1" fill="${brand}"/>
     </svg>`;

    this._iconShop = window.L.divIcon({
      className: "lf-pin-shop",
      html: svg,
      iconSize: [W, H],
      iconAnchor: [W / 2, H - 2], // 尖りの少し上を基準に
      popupAnchor: [0, -H],
    });
    return this._iconShop;
  }

  async init(
    containerId,
    { center = [35.681236, 139.767125], zoom = 13 } = {}
  ) {
    if (!window.L) throw new Error("Leaflet not loaded");
    // ベースマップ
    this.map = window.L.map(containerId, {
      zoomControl: false,
      attributionControl: true,
    }).setView(center, zoom);

    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(this.map);

    this.layer = window.L.featureGroup().addTo(this.map);
  }

  /* マーカーを差し替え（高速化のため分割追加に対応） */
  async setMarkers(items = [], { chunk = 80, delay = 8 } = {}) {
    if (!this.map) return;
    const L = window.L;
    const icon = this._makeShopIcon();

    // 既存マーカー削除
    this._markers.forEach((m) => m.remove());
    this._markers = [];

    // 追加
    for (let i = 0; i < items.length; i += chunk) {
      const part = items.slice(i, i + chunk);
      for (const it of part) {
        const lat = Number(it.__lat),
          lng = Number(it.__lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

        const m = window.L.marker([it.__lat, it.__lng], {
          icon: this._mkShopIcon(),
        }).addTo(this.layer);

        m._shop = it;
        m.on("click", () => this._clickCb?.(it));
        this._markers.push(m);
      }
      if (delay) await new Promise((r) => setTimeout(r, delay));
    }
    return this._markers;
  }

  onMarkerClick(cb) {
    this._clickCb = cb;
  }

  fitToMarkers({ padding = 56, maxZoom = 16 } = {}) {
    if (!this._markers.length) return;
    const L = window.L;
    const b = L.latLngBounds(this._markers.map((m) => m.getLatLng()));
    if (b.isValid())
      this.map.fitBounds(b, { padding: [padding, padding], maxZoom });
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
        radius: 9,
        color: "#2a6ef0",
        weight: 2,
        fillColor: "#2a6ef0",
        fillOpacity: 1,
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
        radius: 6,
        color: "#0e5d45",
        weight: 2,
        fillColor: "#0e5d45",
        fillOpacity: 1,
      }).addTo(this.layer);
    } else {
      this.searchMarker.setLatLng([lat, lng]); // bringToFront は不要（モバイル互換）
    }
  }
}
