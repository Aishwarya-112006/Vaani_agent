import { AnimatePresence, motion } from "framer-motion";
import { Wifi, WifiOff } from "lucide-react";

import type { AgentState } from "@/hooks/useWebSocket";

type Tone = "violet" | "lime" | "amber" | "cyan" | "rose" | "muted";

type DebugPanelProps = {
  state: AgentState | null;
  connected: boolean;
  /** Optional client-measured timings (B9) */
  latency?: {
    toolDelaySec?: number | null;
    lastAckToCompleteMs?: number | null;
  };
};

function toneForStatus(status: string): Tone {
  if (status === "RUNNING") return "lime";
  if (status === "CANCELLED") return "rose";
  if (status === "COMPLETE") return "violet";
  return "muted";
}

/**
 * Live judge / debug panel.
 * Core fields from WebSocket AgentState; optional latency badges from tool result.
 */
export function DebugPanel({ state, connected, latency }: DebugPanelProps) {
  const turnId = state ? String(state.turn_id) : "—";
  const requestId = state?.active_request_id || "—";
  const toolStatus = state?.tool_status ?? "—";
  const interrupt = state?.last_interrupt_type || "—";
  const stale = state ? String(state.stale_discarded) : "—";
  const placesSource = state?.last_tool_result?.source || "—";
  const toolMs =
    typeof latency?.toolDelaySec === "number"
      ? `${Math.round(latency.toolDelaySec * 1000)} ms`
      : typeof state?.last_tool_result?.delay_seconds === "number"
        ? `${Math.round(state.last_tool_result.delay_seconds * 1000)} ms`
        : "—";
  const ackGap =
    typeof latency?.lastAckToCompleteMs === "number"
      ? `${Math.round(latency.lastAckToCompleteMs)} ms`
      : "—";

  return (
    <aside className="glass-card h-fit p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[.2em] text-brand-cyan">JUDGE PANEL</p>
          <h2 className="mt-1 font-semibold">Live debug</h2>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <Wifi className="size-3 text-brand-lime" aria-label="WebSocket connected" />
          ) : (
            <WifiOff className="size-3 text-muted-foreground" aria-label="WebSocket disconnected" />
          )}
          <span
            className={`size-2 rounded-full ${connected ? "animate-pulse bg-brand-lime" : "bg-muted-foreground/40"}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="turn_id" value={turnId} tone="violet" />
        <Metric label="active_request_id" value={requestId} tone="muted" />
        <Metric label="tool_status" value={toolStatus} tone={toneForStatus(toolStatus)} />
        <Metric label="interrupt_type" value={interrupt} tone="cyan" />
        <Metric label="stale_discarded" value={stale} tone="amber" />
        <Metric label="places_source" value={placesSource} tone="cyan" />
        <Metric label="tool_delay" value={toolMs} tone="lime" />
        <Metric label="ack→complete" value={ackGap} tone="muted" />
      </div>

      {!connected && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          Waiting for WebSocket… start the backend (`pnpm dev` in /backend).
        </p>
      )}
    </aside>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const toneClass =
    tone === "violet"
      ? "text-brand-violet"
      : tone === "lime"
        ? "text-brand-lime"
        : tone === "amber"
          ? "text-brand-amber"
          : tone === "cyan"
            ? "text-brand-cyan"
            : tone === "rose"
              ? "text-brand-rose"
              : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={value}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className={`mt-2 truncate font-mono text-sm font-semibold ${toneClass}`}
        >
          {value}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

export default DebugPanel;
