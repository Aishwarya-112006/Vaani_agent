import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

export type ToolResult = {
  tool?: string;
  summary?: string;
  count?: number;
  results?: unknown[];
  params?: Record<string, unknown>;
  delay_seconds?: number;
  reply_lang?: string;
};

export type AgentState = {
  session_id: string;
  turn_id: number;
  tool_status: "IDLE" | "RUNNING" | "CANCELLED" | "COMPLETE";
  stale_discarded: number;
  last_interrupt_type: string | null;
  active_request_id: string | null;
  current_task: Record<string, unknown>;
  last_tool_result?: ToolResult | null;
};

type UseWebSocketReturn = {
  state: AgentState | null;
  connected: boolean;
};

/**
 * Connects to the backend WebSocket at /ws/{sessionId} and streams
 * AgentState updates in real time for the DebugPanel.
 */
export function useWebSocket(sessionId: string | null): UseWebSocketReturn {
  const [state, setState] = useState<AgentState | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId || sessionId === "pending") return;

    const wsBase = API_BASE.replace(/^http/, "ws");
    const url = `${wsBase}/ws/${sessionId}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as AgentState;
        setState(data);
      } catch {
        /* ignore malformed frames */
      }
    };

    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  return { state, connected };
}
