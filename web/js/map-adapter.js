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
  // === Shop pin (DPR対応・サイトカラー) ===
  _; // === Shop pin (PC: divIcon / Mobile: data-URL image) ===
  // === Shop pin (小さめ、--brand色) ==========================
  _mkShopIcon() {
    if (this._iconShop) return this._iconShop;

    // サイトのブランド色を使用
    const css = getComputedStyle(document.documentElement);
    const brand =
      (css.getPropertyValue("--brand") || "#7a5a2d").trim() || "#7a5a2d";

    // iOS/Android WebView は data:URL 画像にフォールバック
    const ua = navigator.userAgent || "";
    const isIOS = /iP(hone|ad|od)/.test(ua);
    const isAndroidWV =
      /\bwv\b/.test(ua) ||
      (/Version\/\d+\.\d+/.test(ua) && /Chrome\/\d+\.\d+ Mobile/.test(ua));
    const forceImage = isIOS || isAndroidWV;

    // ← 大きさはここで調整（既存より小さめに）
    const PIN_BASE_W = 22; // 幅（px）
    const PIN_BASE_H = 30; // 高さ（px）
    const isSmallScreen = window.matchMedia("(max-width: 480px)").matches;
    const PIN_SCALE = isSmallScreen ? 0.85 : 1; // モバイルはやや小さく
    const DPR = Math.min(1.3, Math.max(1, window.devicePixelRatio || 1)); // 高DPIの肥大化を抑制

    const W = Math.round(PIN_BASE_W * PIN_SCALE * DPR);
    const H = Math.round(PIN_BASE_H * PIN_SCALE * DPR);

    // ショップを表す簡易ストアフロント（角丸の看板） ※色は --brand
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 22 30" aria-hidden="true">
       <path d="M11 0c6 0 11 4.7 11 10.5 0 7-8.4 15.3-10.4 17.3a1 1 0 0 1-1.2 0C8.4 25.8 0 17.5 0 10.5 0 4.7 5 0 11 0Z" fill="${brand}"/>
       <rect x="5" y="9" width="12" height="8" rx="2" ry="2" fill="#fff"/>
       <rect x="7.2" y="11" width="3.3" height="5" rx="1" fill="${brand}"/>
       <rect x="11.5" y="11" width="3.3" height="5" rx="1" fill="${brand}"/>
     </svg>`;

    if (forceImage) {
      const url = "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
      this._iconShop = window.L.icon({
        iconUrl: url,
        iconSize: [W, H],
        iconAnchor: [W / 2, H - 2],
        popupAnchor: [0, -H],
      });
    } else {
      this._iconShop = window.L.divIcon({
        className: "lf-pin-shop",
        html: svg,
        iconSize: [W, H],
        iconAnchor: [W / 2, H - 2],
        popupAnchor: [0, -H],
      });
    }
    return this._iconShop;
  }

  // 互換（古い呼び名を使っている箇所があってもOK）
  _makeShopIcon() {
    return this._mkShopIcon();
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

  // LeafletAdapter 内に配置（既存の addCurrentDot を置き換え）
  addCurrentDot(lat, lng, opts = {}) {
    const L = window.L;
    if (!L || !this.map) return null;

    // サイトのアクセント色を使用（--accent が無ければ青）
    const css = getComputedStyle(document.documentElement);
    const accent =
      (css.getPropertyValue("--accent") || "#2a6ef0").trim() || "#2a6ef0";

    // デフォルトを大きめに（モバイルはさらに +α）
    const isSmall = window.matchMedia("(max-width: 480px)").matches;
    const size = Math.max(
      8,
      Math.min(18, Number(opts.size) || (isSmall ? 12 : 11)) // ← ここで大きさ調整
    );

    const style = {
      radius: size,
      color: "#fff", // 外枠（白）で視認性UP
      weight: 3, // 外枠の太さ
      fillColor: accent, // 中の色
      fillOpacity: 1,
    };

    if (!this._meDot) {
      this._meDot = L.circleMarker([lat, lng], style).addTo(
        this.layer || this.map
      );
      this._meDot.bringToFront?.();
    } else {
      this._meDot.setLatLng([lat, lng]);
      this._meDot.setStyle(style);
      this._meDot.bringToFront?.();
    }
    return this._meDot;
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
