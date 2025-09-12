// web/js/map-adapter.js
export function createMapAdapter(engine = "leaflet") {
  if (engine === "google") return GoogleAdapter();
  return LeafletAdapter(); // default
}

// web/js/map-adapter.js  ← ファイル先頭〜中腹（クラス定義より前）に追加
export async function loadGoogleMapsOnce(
  apiKey,
  extraParams = "v=weekly&libraries=marker&loading=async"
) {
  if (window.google?.maps) return window.google.maps;
  if (!apiKey) throw new Error("NO_GOOGLE_MAPS_KEY");

  await new Promise((resolve, reject) => {
    const cb = "__gmaps_cb_" + Date.now();
    window[cb] = () => {
      resolve();
      delete window[cb];
    };

    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&${extraParams}&callback=${cb}`;
    s.async = true; // ← Google 推奨の async ロード
    s.onerror = reject;
    document.head.appendChild(s);
  });

  return window.google.maps;
}

/* ---------- Leaflet + OSM ---------- */
function LeafletAdapter() {
  let map,
    markers = [];
  return {
    name: "leaflet",
    async init(el, { center = { lat: 35.68, lng: 139.76 }, zoom = 14 } = {}) {
      // 動的ロード（leaflet）
      await loadCss("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
      await loadJs("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
      map = L.map(el).setView([center.lat, center.lng], zoom);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
      }).addTo(map);
      return this;
    },
    setCenter({ lat, lng, zoom }) {
      map.setView([lat, lng], zoom ?? map.getZoom());
    },
    addMarkers(items, { onClick } = {}) {
      // items: [{id, lat, lng, title, thumb}] を想定
      items.forEach((s) => {
        const m = L.marker([s.lat, s.lng]).addTo(map);
        m.on("click", () => onClick?.(s));
        markers.push(m);
      });
    },
    fitBounds(items) {
      if (!items?.length) return;
      const b = L.latLngBounds(items.map((s) => [s.lat, s.lng]));
      map.fitBounds(b, { padding: [24, 24] });
    },
    clear() {
      markers.forEach((m) => m.remove());
      markers = [];
    },
    destroy() {
      map?.remove();
      map = null;
      markers = [];
    },
  };
}

/* ---------- Google Maps JS ---------- */
function GoogleAdapter() {
  let map,
    markers = [];
  return {
    name: "google",
    async init(el, { center = { lat: 35.68, lng: 139.76 }, zoom = 14 } = {}) {
      // 動的ロード（Google）
      await loadJs(
        "https://maps.googleapis.com/maps/api/js?key=YOUR_KEY&libraries=marker"
      );
      map = new google.maps.Map(el, { center, zoom, mapId: "YOUR_MAP_ID" });
      return this;
    },
    setCenter({ lat, lng, zoom }) {
      map.setCenter({ lat, lng });
      if (zoom) map.setZoom(zoom);
    },
    addMarkers(items, { onClick } = {}) {
      items.forEach((s) => {
        const m = new google.maps.Marker({
          position: { lat: s.lat, lng: s.lng },
          map,
          title: s.title,
        });
        m.addListener("click", () => onClick?.(s));
        markers.push(m);
      });
    },
    fitBounds(items) {
      if (!items?.length) return;
      const b = new google.maps.LatLngBounds();
      items.forEach((s) => b.extend({ lat: s.lat, lng: s.lng }));
      map.fitBounds(b, { padding: 24 });
    },
    clear() {
      markers.forEach((m) => m.setMap(null));
      markers = [];
    },
    destroy() {
      this.clear();
      map = null;
    },
  };
}

/* ---------- tiny loader ---------- */
function loadJs(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
}
function loadCss(href) {
  return new Promise((res, rej) => {
    if (document.querySelector(`link[href="${href}"]`)) return res();
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.onload = res;
    l.onerror = rej;
    document.head.appendChild(l);
  });
}
