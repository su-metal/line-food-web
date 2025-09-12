// web/js/map-adapter.js
class LeafletAdapter {
  constructor() {
    this.map = null;
    this.markersLayer = null; // 店舗
    this.miscLayer = null;    // 現在地など
    this.markers = [];
    this._onClick = null;
    this.meMarker = null;     // 現在地(FeatureGroup)
  }

  async init(containerId, { center = [35.681236,139.767125], zoom = 14 } = {}) {
    const L = window.L;
    if (!L) throw new Error("Leaflet not loaded");

    this.map = L.map(containerId, { zoomControl:false, attributionControl:true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.miscLayer    = L.layerGroup().addTo(this.map);

    this.map.setView(center, zoom);
  }

  clearMarkers() {
    this.markersLayer?.clearLayers();
    this.markers = [];
  }

  async addMarkers(items = [], { chunk = 0, delay = 0 } = {}) {
    const L = window.L;
    const addOne = (s) => {
      const m = L.circleMarker([s.__lat, s.__lng], {
        radius: 8,
        color: "#154f3e",
        weight: 2,
        fillColor: "#0e7b61",
        fillOpacity: 0.9
      }).addTo(this.markersLayer);
      m.on("click", () => this._onClick?.(s));
      this.markers.push(m);
    };
    if (!chunk || chunk <= 0) {
      items.forEach(addOne);
    } else {
      for (let i = 0; i < items.length; i += chunk) {
        items.slice(i, i + chunk).forEach(addOne);
        if (delay) await new Promise(r => setTimeout(r, delay));
      }
    }
    return this.markers;
  }

  async setMarkers(items = [], opts = {}) {
    this.clearMarkers();
    return this.addMarkers(items, opts);
  }

  onMarkerClick(handler){ this._onClick = handler; }

  fitToMarkers({ padding = 56, maxZoom = 17 } = {}) {
    const L = window.L;
    if (!this.markers.length) return;
    const b = L.latLngBounds(this.markers.map(m => m.getLatLng()));
    if (b.isValid()) this.map.fitBounds(b, { padding:[padding,padding], maxZoom });
  }

  setCenter(lat, lng, zoom){ this.map.setView([lat, lng], zoom ?? this.map.getZoom()); }

  /** 現在地：CSS不要のインラインスタイル＋円マーカーの二段構え */
  addCurrentDot(lat, lng) {
    const L = window.L;
    if (this.meMarker) this.miscLayer.removeLayer(this.meMarker);

    // 1) 視認性の高い DivIcon（インラインCSSで確実に表示）
    const html =
      '<span style="display:block;width:18px;height:18px;border-radius:50%;' +
      'background:#2a6ef0;border:2px solid #fff;' +
      'box-shadow:0 0 0 3px rgba(42,110,240,.35),0 0 0 1.5px #ffffff inset"></span>';
    const divIcon = L.divIcon({ className: '', html, iconSize:[18,18], iconAnchor:[9,9] });
    const divMarker = L.marker([lat, lng], { icon: divIcon, interactive:false, zIndexOffset: 1000 });

    // 2) フォールバックの円（もしDivIconが描けなくても残る）
    const dot = L.circleMarker([lat, lng], {
      radius: 5, color: "#2a6ef0", fillColor: "#2a6ef0", fillOpacity: 1, weight: 2
    });

    this.meMarker = L.featureGroup([dot, divMarker]).addTo(this.miscLayer);
    return this.meMarker;
  }
}

export function createMapAdapter(kind = "leaflet") {
  return new LeafletAdapter();
}
