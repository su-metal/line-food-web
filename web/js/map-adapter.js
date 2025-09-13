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
  // LeafletAdapter 内
  _makeShopIcon(opts = {}) {
    const L = window.L;
    if (!L) return null;

    // サイト色
    const css = getComputedStyle(document.documentElement);
    const brand =
      (
        css.getPropertyValue("--brand") ||
        css.getPropertyValue("--accent") ||
        "#A67C52"
      ).trim() || "#A67C52";
    const pinFill = opts.fill || brand;
    const pinStroke = "rgba(0,0,0,.25)"; // わずかな外枠で視認性

    // ★ ここがサイズ。ひと回り大きく（PC:28 / SP:30）。opts.size で上書き可
    const isSmall = window.matchMedia("(max-width: 480px)").matches;
    const SIZE = Math.max(
      20,
      Math.min(48, Number(opts.size) || (isSmall ? 30 : 28))
    );

    // 24px ベースの SVG を width/height で等倍スケール
    const html = `
  <div class="shop-pin" style="width:${SIZE}px;height:${SIZE}px;transform:translate(-50%,-100%);">
    <svg viewBox="0 0 24 24" width="${SIZE}" height="${SIZE}" aria-hidden="true">
      <!-- ピン本体 -->
      <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"
        fill="${pinFill}" stroke="${pinStroke}" stroke-width="1"/>
      <!-- 中央の店アイコン（mのロゴ風） -->
      <rect x="7" y="9" width="10" height="7" rx="2" ry="2" fill="white"/>
      <path d="M9.2 13.7v-2.4h1.8c.5 0 .9.4.9.9v1.5h1v-1.5c0-.5.4-.9.9-.9h1.8v2.4"
        fill="${pinFill}"/>
    </svg>
  </div>`;

    return L.divIcon({
      className: "shop-pin-wrap",
      html,
      iconSize: [SIZE, SIZE],
      iconAnchor: [SIZE / 2, SIZE], // 先端を地物に合わせる
      popupAnchor: [0, -SIZE],
    });
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
