/* ====== map-adapter.js（抜粋・このブロックを上部に1回だけ置く） ====== */
// CSS変数取得（統一）
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}
// ブランド色（統一）
function brandColor() {
  return cssVar("--brand", "#2d6b57"); // 無ければ濃い緑
}

// …（createMapAdapter / LeafletAdapter の宣言は既存のまま）…

class LeafletAdapter {
  // …init / setCenter 等は既存のままでOK…

  // ★ 統一：ショップ用ピンSVGを生成（ハートは使わない）
  _makeShopIcon(size = 32, color) {
    const col = color || brandColor();
    const S = Math.max(20, +size || 32);     // 幅
    const H = Math.round(S * 1.35);          // 高さ（先端含む）
    const anchor = [Math.round(S / 2), H - 2];

    const html = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${H}" viewBox="0 0 24 32" aria-hidden="true">
      <!-- しずく本体（角丸っぽい形） -->
      <path d="M12 0C6 0 1.5 4.5 1.5 10.5 1.5 19 12 26 12 26s10.5-7 10.5-15.5C22.5 4.5 18 0 12 0Z"
            fill="${col}" stroke="white" stroke-width="2" />
      <!-- ショップの簡易グリフ -->
      <g transform="translate(4,7)" fill="white">
        <rect x="0" y="0" width="4.2" height="4" rx="0.8"/>
        <rect x="5.9" y="0" width="4.2" height="4" rx="0.8"/>
        <rect x="11.8" y="0" width="4.2" height="4" rx="0.8"/>
        <rect x="0" y="7" width="20" height="9" rx="1.2"/>
        <rect x="9" y="7" width="2" height="9" rx="0.8"/>
      </g>
    </svg>`.trim();

    return {
      html,
      className: "pin-shop",
      iconSize: [S, H],
      iconAnchor: anchor,
      popupAnchor: [0, -Math.round(S * 0.7)],
    };
  }

  // ★ 統一：マーカー描画（_makeShopIcon を必ず使用）
  setMarkers(items = [], opts = {}) {
    const L = window.L;
    if (!L || !this.map) return [];

    // 既存マーカー撤去
    if (this._markersLayer) this._markersLayer.remove();
    this._markersLayer = L.layerGroup().addTo(this.map);
    this._markers = [];

    const size = Number(opts.size) || 32;
    const color = opts.color || brandColor();

    items.forEach((it) => {
      const lat = Number(it.__lat ?? it.lat), lng = Number(it.__lng ?? it.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const def = this._makeShopIcon(size, color);
      const icon = L.divIcon({
        html: def.html,
        className: def.className,
        iconSize: def.iconSize,
        iconAnchor: def.iconAnchor,
        popupAnchor: def.popupAnchor,
      });

      const m = L.marker([lat, lng], { icon }).addTo(this._markersLayer);
      m.__data = it;
      if (this._onMarkerClick) m.on("click", () => this._onMarkerClick(it));
      this._markers.push(m);
    });

    return this._markers;
  }

  onMarkerClick(cb) {
    this._onMarkerClick = typeof cb === "function" ? cb : null;
  }
}
