import { AnimatePresence, motion } from "framer-motion";

import { markersFromToolResult, ResultsMap, type MapMarker } from "./ResultsMap";
import type { ToolResult } from "@/hooks/useWebSocket";

type PlacesPanelProps = {
  result: ToolResult | null;
  searching?: boolean;
  city?: string;
};

function PlaceRows({ markers }: { markers: MapMarker[] }) {
  if (!markers.length) return null;
  return (
    <ul className="mt-2 max-h-36 space-y-1.5 overflow-y-auto pr-1">
      {markers.map((m, i) => (
        <li
          key={`${m.name}-${m.lat}-${m.lon}`}
          className="rounded-xl border border-border/80 bg-background/50 px-3 py-2"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-brand-violet">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{m.name}</p>
              {m.subtitle ? (
                <p className="truncate text-[11px] text-muted-foreground">{m.subtitle}</p>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Left-side live map panel: map on top, place list underneath. */
export function PlacesPanel({ result, searching, city }: PlacesPanelProps) {
  const markers = markersFromToolResult(result);
  const source = result?.source;

  return (
    <motion.aside
      layout
      initial={{ opacity: 0, x: -24, width: 0 }}
      animate={{ opacity: 1, x: 0, width: "auto" }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ type: "spring", stiffness: 320, damping: 28 }}
      className="glass-card flex h-fit max-h-full flex-col self-start overflow-hidden p-3 sm:p-4 lg:max-h-full lg:overflow-y-auto"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-cyan">
            Live map
          </p>
          <h2 className="text-sm font-semibold text-foreground">
            {searching && !markers.length
              ? `Searching${city ? ` · ${city}` : ""}…`
              : city
                ? `Where · ${city}`
                : "Where they are"}
          </h2>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {source === "geoapify+osm"
            ? "OSM live"
            : source === "mock"
              ? "Demo pins"
              : searching
                ? "…"
                : "—"}
        </p>
      </div>

      {result?.budget_note ? (
        <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">{result.budget_note}</p>
      ) : null}

      <div>
        <AnimatePresence mode="wait">
          {markers.length ? (
            <motion.div
              key="map"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              <ResultsMap markers={markers} source={source} variant="panel" />
            </motion.div>
          ) : (
            <motion.div
              key="pending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 text-center sm:h-44"
            >
              <div className="mb-3 size-10 animate-pulse rounded-full border-2 border-brand-cyan/40 border-t-brand-cyan" />
              <p className="text-sm font-medium text-foreground">
                {searching ? "Pinning places on the map…" : "Waiting for results"}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Live locations appear here as soon as search completes.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Places
        </p>
        {markers.length ? (
          <PlaceRows markers={markers} />
        ) : (
          <p className="py-3 text-center text-[11px] text-muted-foreground">
            Results list opens under the map.
          </p>
        )}
      </div>
    </motion.aside>
  );
}
