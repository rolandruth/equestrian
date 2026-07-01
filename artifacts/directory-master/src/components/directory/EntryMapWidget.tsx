import { useEffect, useRef } from "react";
import { Navigation } from "lucide-react";

interface EntryMapWidgetProps {
  latitude: number;
  longitude: number;
  title: string;
  address?: string;
}

export function EntryMapWidget({ latitude, longitude, title, address }: EntryMapWidgetProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center: [latitude, longitude],
        zoom: 14,
        scrollWheelZoom: false,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.marker([latitude, longitude])
        .addTo(map)
        .bindPopup(`<strong>${title}</strong>${address ? `<br/><span style="font-size:12px">${address}</span>` : ""}`)
        .openPopup();

      mapInstanceRef.current = map;
    })();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [latitude, longitude, title, address]);

  const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

  return (
    <div>
      <div ref={mapRef} className="w-full rounded-lg overflow-hidden border" style={{ height: 220 }} />
      <a
        href={googleUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        <Navigation className="h-4 w-4" />
        Get Directions
      </a>
    </div>
  );
}
