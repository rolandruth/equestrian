import { useEffect, useRef } from "react";
import { Link } from "wouter";

interface MapEntry {
  id: number;
  title: string;
  slug?: string | null;
  latitude: number | null;
  longitude: number | null;
  location?: string | null;
  category?: string | null;
  summary?: string | null;
}

interface BrowseMapViewProps {
  entries: MapEntry[];
  themeColor?: string;
}

export function BrowseMapView({ entries, themeColor }: BrowseMapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);

  const mapped = entries.filter(e => e.latitude != null && e.longitude != null);

  useEffect(() => {
    if (!mapRef.current) return;
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }

    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");

      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const center: [number, number] = mapped.length > 0
        ? [mapped[0].latitude!, mapped[0].longitude!]
        : [39.5, -98.35];
      const zoom = mapped.length > 0 ? 5 : 4;

      const map = L.map(mapRef.current!, { center, zoom, scrollWheelZoom: true });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const bounds: [number, number][] = [];

      for (const entry of mapped) {
        const lat = entry.latitude!;
        const lng = entry.longitude!;
        bounds.push([lat, lng]);

        const marker = L.marker([lat, lng]).addTo(map);
        const href = `/entry/${entry.slug || entry.id}`;
        marker.bindPopup(`
          <div style="min-width:160px;max-width:220px">
            <a href="${href}" style="font-weight:600;font-size:14px;color:#1a1a1a;text-decoration:none">${entry.title}</a>
            ${entry.category ? `<div style="margin-top:4px"><span style="font-size:11px;background:#f3f4f6;padding:2px 6px;border-radius:4px;color:#555">${entry.category}</span></div>` : ""}
            ${entry.location ? `<div style="margin-top:4px;font-size:12px;color:#666">${entry.location}</div>` : ""}
            <a href="${href}" style="display:inline-block;margin-top:8px;font-size:12px;color:${themeColor || "#6366f1"};font-weight:500">View Details →</a>
          </div>
        `);
      }

      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
      }

      mapInstanceRef.current = map;
    })();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [entries]);

  return (
    <div>
      <div ref={mapRef} style={{ height: 580, width: "100%" }} className="rounded-xl overflow-hidden border" />
      {mapped.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/80 dark:bg-gray-900/80 rounded-xl">
          <p className="text-muted-foreground text-sm">No entries with location data yet.</p>
          <p className="text-muted-foreground text-xs mt-1">Coordinates are geocoded automatically from addresses.</p>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-2 text-right">
        {mapped.length} of {entries.length} listings mapped
      </p>
    </div>
  );
}
