import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker, Circle } from "leaflet";

interface LiveWorkerMapProps {
  lat: number;
  lng: number;
  updatedAt?: string | null;
}

export default function LiveWorkerMap({ lat, lng, updatedAt }: LiveWorkerMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const pulseRef = useRef<Circle | null>(null);

  useEffect(() => {
    let L: typeof import("leaflet");

    async function initMap() {
      if (!containerRef.current || mapRef.current) return;

      L = (await import("leaflet")).default;

      // Fix default icon paths broken by bundlers
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(containerRef.current, {
        center: [lat, lng],
        zoom: 16,
        zoomControl: true,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      // Pulsing circle underneath
      const pulse = L.circle([lat, lng], {
        radius: 25,
        color: "#22c55e",
        fillColor: "#22c55e",
        fillOpacity: 0.25,
        weight: 2,
        opacity: 0.7,
      }).addTo(map);

      // Custom green pin icon
      const workerIcon = L.divIcon({
        className: "",
        html: `
          <div style="position:relative;width:36px;height:36px;">
            <div style="position:absolute;inset:0;border-radius:50%;background:#22c55e;opacity:0.25;animation:ping 1.4s cubic-bezier(0,0,0.2,1) infinite;"></div>
            <div style="position:absolute;inset:4px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            </div>
          </div>
        `,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      const marker = L.marker([lat, lng], { icon: workerIcon }).addTo(map);
      marker.bindPopup("<b>Worker</b><br>Live location").openPopup();

      mapRef.current = map;
      markerRef.current = marker;
      pulseRef.current = pulse;
    }

    initMap();

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        pulseRef.current = null;
      }
    };
  }, []);

  // Smoothly move marker and recenter when lat/lng change
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !pulseRef.current) return;
    const newLatLng = [lat, lng] as [number, number];
    markerRef.current.setLatLng(newLatLng);
    pulseRef.current.setLatLng(newLatLng);
    mapRef.current.panTo(newLatLng, { animate: true, duration: 0.8 });
  }, [lat, lng]);

  return (
    <>
      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2.5); opacity: 0; }
        }
        @import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
      `}</style>
      <link
        rel="stylesheet"
        href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      />
      <div
        ref={containerRef}
        data-testid="live-worker-map"
        style={{ width: "100%", height: "240px", borderRadius: "12px", overflow: "hidden" }}
      />
    </>
  );
}
