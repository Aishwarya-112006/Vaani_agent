import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  name: string;
  lat: number;
  lon: number;
  subtitle?: string;
};

type ResultsMapProps = {
  markers: MapMarker[];
  source?: string | null;
  className?: string;
  /** Larger map for the left search panel */
  variant?: "inline" | "panel";
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function ResultsMap({ markers, source, className, variant = "inline" }: ResultsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const el = containerRef.current;
    if (!el || markers.length === 0) return;

    let cancelled = false;

    void (async () => {
      const leaflet = await import("leaflet");
      const L = leaflet.default;

      if (cancelled || !containerRef.current) return;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const DefaultIcon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });
      L.Marker.prototype.options.icon = DefaultIcon;

      const map = L.map(el, { scrollWheelZoom: false, attributionControl: true });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const group = L.featureGroup();
      for (const m of markers) {
        const popup = `<strong>${escapeHtml(m.name)}</strong>${
          m.subtitle ? `<br/><span>${escapeHtml(m.subtitle)}</span>` : ""
        }`;
        L.marker([m.lat, m.lon]).bindPopup(popup).addTo(group);
      }
      group.addTo(map);

      if (markers.length === 1) {
        const only = markers[0];
        if (only) map.setView([only.lat, only.lon], 14);
      } else {
        map.fitBounds(group.getBounds().pad(0.25));
      }

      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
    // markerKey stabilizes identity when parent recreates the array each render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, markers.map((m) => `${m.lat},${m.lon},${m.name}`).join("|")]);

  if (!markers.length) {
    return (
      <div className={className}>
        <p className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-6 text-center text-[11px] text-muted-foreground">
          Map pins need coordinates — enable live places or wait for geocode enrichment.
        </p>
      </div>
    );
  }

  const sourceLabel =
    source === "geoapify+osm"
      ? "Live · OpenStreetMap"
      : source === "mock"
        ? "Demo inventory · mapped"
        : null;

  const mapHeight =
    variant === "panel" ? "h-64 w-full sm:h-72 lg:h-[22rem]" : "h-56 w-full sm:h-64";

  return (
    <div className={className}>
      {variant === "inline" ? (
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Results map
          </p>
          {sourceLabel ? (
            <p className="text-[10px] text-muted-foreground/80">{sourceLabel}</p>
          ) : null}
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={`${mapHeight} overflow-hidden rounded-xl border border-border bg-muted/30`}
        role="img"
        aria-label="Map of search results"
      />
    </div>
  );
}

/** Pull pin-ready markers from a tool result payload. */
export function markersFromToolResult(result: {
  results?: unknown[];
} | null): MapMarker[] {
  if (!result?.results || !Array.isArray(result.results)) return [];
  const out: MapMarker[] = [];
  for (const row of result.results) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const lat = typeof r["lat"] === "number" ? r["lat"] : Number(r["lat"]);
    const lon = typeof r["lon"] === "number" ? r["lon"] : Number(r["lon"]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const name =
      typeof r["name"] === "string" && r["name"].trim() ? r["name"] : "Place";
    const area = typeof r["area"] === "string" ? r["area"] : "";
    const price =
      typeof r["price_inr"] === "number"
        ? `₹${r["price_inr"]}`
        : typeof r["price_for_two"] === "number"
          ? `₹${r["price_for_two"]}/2`
          : "";
    const subtitle = [area, price].filter(Boolean).join(" · ");
    const marker: MapMarker = { name, lat, lon };
    if (subtitle) marker.subtitle = subtitle;
    out.push(marker);
  }
  return out;
}
