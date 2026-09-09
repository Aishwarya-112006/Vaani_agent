import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Radio, Zap } from "lucide-react";

import { createSession, sendTextMessage, setSessionCity } from "@/lib/api";
import { unlockAudio } from "@/lib/audio";
import {
  ackCancel,
  ackPivot,
  ackRefine,
  ackSearch,
  ackStatus,
  askBudget,
  askCity,
  CITY_CHIPS,
  confirmCity,
  constraintChipLabel,
  errNetwork,
  errSttEmpty,
  errSttFailed,
  errTts,
  factFallback,
  FOLLOW_UP_CHIPS,
  greetCity,
  mockBookFirst,
  phaseLabel,
  resultFallbackFromTool,
  resultHotels,
  resultRestaurants,
  searchFiller,
  type ConstraintKey,
  type PipelinePhase,
  type ReplyLang,
} from "@/lib/copy";
import { JUDGE_DEMOS, type JudgeDemo } from "@/lib/demos";
import { speakLine, stopSpeaking } from "@/lib/speak";
import { detectReplyLang } from "@/lib/lang";
import { classifyInterrupt } from "@/lib/interrupt";
import { useWebSocket, type ToolResult } from "@/hooks/useWebSocket";

import { Backdrop } from "./backdrop";
import { DebugPanel } from "./DebugPanel";
import { PlacesPanel } from "./PlacesPanel";
import { PushToTalk } from "./PushToTalk";
import { SiteHeader } from "./site-header";
import { Transcript, type Turn } from "./Transcript";

type Interrupt = "REFINE" | "CANCEL" | "STATUS" | "PIVOT" | "FACT";
type ToolStatus = "IDLE" | "RUNNING" | "CANCELLED" | "COMPLETE";
type Task = { type: "hotel" | "restaurant"; params: string; tool_call_id: string };
export type { Turn };
type Log = { kind: "turn" | "tool" | "interrupt" | "stale"; text: string };

function asReplyLang(value: unknown): ReplyLang {
  return value === "hi" ? "hi" : "en";
}

const chips = [
  "Find hotels in Delhi under ₹5000",
  "Actually, only vegetarian and near a metro",
  "What are you searching for?",
  "What is Connaught Place?",
  "Forget it",
  "Find restaurants in Connaught Place instead",
];

const accentStyles = {
  violet: {
    chip: "border-primary/25 bg-primary/10 text-brand-violet",
    hover: "hover:border-brand-violet/40",
  },
  rose: {
    chip: "border-destructive/25 bg-destructive/10 text-brand-rose",
    hover: "hover:border-brand-rose/40",
  },
  cyan: {
    chip: "border-accent/25 bg-accent/10 text-brand-cyan",
    hover: "hover:border-brand-cyan/40",
  },
  amber: {
    chip: "border-brand-amber/25 bg-brand-amber/10 text-brand-amber",
    hover: "hover:border-brand-amber/40",
  },
} as const;

type Accent = keyof typeof accentStyles;

const interruptCards: {
  type: Interrupt;
  accent: Accent;
  utterance: string;
  description: string;
}[] = [
  {
    type: "REFINE",
    accent: "violet",
    utterance: "Actually, make it vegetarian and near a metro.",
    description: "Merge new constraints into the active task without losing context.",
  },
  {
    type: "CANCEL",
    accent: "rose",
    utterance: "Forget it — stop searching.",
    description: "Fence the in-flight tool call and clear the task cleanly.",
  },
  {
    type: "STATUS",
    accent: "cyan",
    utterance: "What are you searching for?",
    description: "Answer immediately while the original search keeps running.",
  },
  {
    type: "FACT",
    accent: "cyan",
    utterance: "What is Connaught Place?",
    description: "Wikipedia aside — speak a fact without cancelling the search.",
  },
  {
    type: "PIVOT",
    accent: "amber",
    utterance: "Find restaurants there instead.",
    description: "Switch domains and invalidate the previous result.",
  },
];

function now() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function resolveTaskType(text: string, previous?: Task | null): Task["type"] {
  const s = text.toLowerCase();
  const restaurant = /restaurant|food|eat|dinner|cafe|cuisine|thali|lunch|breakfast/.test(s);
  const hotel = /\bhotels?\b|\bstay\b|\brooms?\b|lodging|accommodation|resort/.test(s);
  if (restaurant && !hotel) return "restaurant";
  if (hotel && !restaurant) return "hotel";
  if (restaurant && hotel) {
    if (/\brestaurants?\b/.test(s)) return "restaurant";
    if (/\bhotels?\b/.test(s)) return "hotel";
  }
  // REFINE / continuation — keep current tool (don't flip on "veg" / "metro")
  if (previous?.type) return previous.type;
  return "hotel";
}

type ConstraintChip = {
  key: ConstraintKey;
  paramKey: string;
  value: string;
  label: string;
};

const PARAM_TO_CONSTRAINT: Record<string, ConstraintKey> = {
  city: "city",
  budget: "budget",
  veg_only: "veg",
  near_metro: "metro",
  cuisine: "cuisine",
  area: "area",
};

function splitParams(params: string): string[] {
  return params
    .split(" · ")
    .map((p) => p.trim())
    .filter(Boolean);
}

function paramsToChips(params: string, lang: ReplyLang): ConstraintChip[] {
  const chips: ConstraintChip[] = [];
  for (const part of splitParams(params)) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const paramKey = part.slice(0, eq);
    const value = part.slice(eq + 1);
    const key = PARAM_TO_CONSTRAINT[paramKey];
    if (!key) continue;
    if ((paramKey === "veg_only" || paramKey === "near_metro") && value !== "true") continue;
    chips.push({
      key,
      paramKey,
      value,
      label: constraintChipLabel(key, value, lang),
    });
  }
  return chips;
}

function removeParamKey(params: string, paramKey: string, fallbackCity: string): string {
  const next = splitParams(params).filter((p) => !p.startsWith(`${paramKey}=`));
  if (!next.some((p) => p.startsWith("city="))) {
    next.unshift(`city=${fallbackCity.trim() || "Delhi"}`);
  }
  return next.join(" · ");
}

function parseTask(text: string, previous?: Task | null, defaultCity = "Delhi"): Task {
  const s = text.toLowerCase();
  const type = resolveTaskType(text, previous);
  // Last city mentioned wins (e.g. "Bangalore wait Jaipur" → Jaipur)
  const cityList = [
    "Delhi",
    "Mumbai",
    "Bangalore",
    "Hyderabad",
    "Chennai",
    "Pune",
    "Kolkata",
    "Goa",
    "Jaipur",
  ];
  let city: string | undefined;
  let lastCityIdx = -1;
  for (const name of cityList) {
    const idx = s.lastIndexOf(name.toLowerCase());
    if (idx > lastCityIdx) {
      lastCityIdx = idx;
      city = name;
    }
  }
  const area = [
    "Connaught Place",
    "Indiranagar",
    "Bandra",
    "Andheri",
    "Koramangala",
    "Saket",
    "Karol Bagh",
    "Hauz Khas",
  ].find((x) => s.includes(x.toLowerCase()));
  const budget = text.match(/(?:under|₹)\s?(\d{3,5})/i)?.[1];
  const cuisine = [
    "South Indian",
    "North Indian",
    "Street Food",
    "Chinese",
    "Italian",
    "Cafe",
    "Indian",
  ].find((x) => s.includes(x.toLowerCase()));

  // B7: same search, new city — keep previous filters
  if (previous && /\bsame\b.*\b(but|in|for)\b|\bsame\s+search\b/.test(s) && city) {
    const parts = splitParams(previous.params).filter((p) => !p.startsWith("city="));
    parts.unshift(`city=${city}`);
    return {
      type: previous.type,
      params: parts.join(" · "),
      tool_call_id: Math.random().toString(16).slice(2, 10),
    };
  }

  const values = [
    city ? `city=${city}` : "",
    area ? `area=${area}` : "",
    budget && type === "hotel" ? `budget=${budget}` : "",
    cuisine && type === "restaurant" ? `cuisine=${cuisine}` : "",
    /vegetarian|veg/.test(s) ? "veg_only=true" : "",
    /metro/.test(s) && type === "hotel" ? "near_metro=true" : "",
  ].filter(Boolean);

  // Only merge params when refining the same tool kind
  const merged =
    previous?.type === type ? (previous.params.split(" · ").filter(Boolean) ?? []) : [];
  values.forEach((value) => {
    const key = value.split("=")[0];
    const index = merged.findIndex((x) => x.startsWith(`${key}=`));
    if (index >= 0) merged[index] = value;
    else merged.push(value);
  });

  // Carry city across a pivot
  if (previous && previous.type !== type) {
    const prevCity = previous.params.split(" · ").find((x) => x.startsWith("city="));
    if (prevCity && !merged.some((x) => x.startsWith("city="))) merged.unshift(prevCity);
  }

  if (!merged.some((x) => x.startsWith("city="))) {
    const city = (defaultCity || "").trim();
    if (city) merged.unshift(`city=${city}`);
  }

  // Defaults for restaurant area/cuisine when starting fresh without prior params
  if (type === "restaurant" && merged.length === 0) {
    merged.push("area=Connaught Place", "cuisine=Indian");
  }

  return {
    type,
    params: merged.join(" · "),
    tool_call_id: Math.random().toString(16).slice(2, 10),
  };
}

export function VoiceAgent() {
  const [turnId, setTurnId] = useState(0);
  const [requestId, setRequestId] = useState("—");
  const [stale, setStale] = useState(0);
  const [status, setStatus] = useState<ToolStatus>("IDLE");
  const [interrupt, setInterrupt] = useState<Interrupt | null>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [input, setInput] = useState("");
  const [session, setSession] = useState("pending");
  const [mounted, setMounted] = useState(false);
  const [sendingAudio, setSendingAudio] = useState(false);
  const [recording, setRecording] = useState(false);
  const [phase, setPhase] = useState<PipelinePhase>("idle");
  const [phaseDetail, setPhaseDetail] = useState<string | undefined>();
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [sttDegraded, setSttDegraded] = useState(false);
  const [replyLang, setReplyLang] = useState<ReplyLang>("en");
  const [preferredCity, setPreferredCity] = useState("Delhi");
  const [cityConfirmed, setCityConfirmed] = useState(false);
  const [pendingAsk, setPendingAsk] = useState<"city" | "budget" | null>(null);
  const [demoRunning, setDemoRunning] = useState<string | null>(null);
  const [cityPrompt, setCityPrompt] = useState<{
    open: boolean;
    changing: boolean;
    greeting: string;
    isLocal: boolean;
  }>({ open: false, changing: false, greeting: "", isLocal: true });

  // Real-time backend state via WebSocket
  const { state: wsState, connected: wsConnected } = useWebSocket(mounted ? session : null);

  const currentTurn = useRef(0);
  const timers = useRef<number[]>([]);
  const searchPulse = useRef<number | null>(null);
  const searchTick = useRef(0);
  const toolRunningRef = useRef(false);
  const pendingResultRef = useRef(false);
  const spokenRequestRef = useRef<string | null>(null);
  const taskRef = useRef<Task | null>(null);
  const lastResultRef = useRef<ToolResult | null>(null);
  const [lastResult, setLastResult] = useState<ToolResult | null>(null);
  const replyLangRef = useRef<ReplyLang>("en");
  const preferredCityRef = useRef("");
  const pendingDraftRef = useRef<{
    task: Task;
    interrupt: Interrupt | null;
  } | null>(null);
  const cityConfirmedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ackStartedAtRef = useRef<number | null>(null);
  const [latency, setLatency] = useState<{
    toolDelaySec?: number | null;
    lastAckToCompleteMs?: number | null;
  }>({});

  const setLang = useCallback((next: ReplyLang) => {
    replyLangRef.current = next;
    setReplyLang(next);
  }, []);

  const clearLocalTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  }, []);

  const clearSearchPulse = useCallback(() => {
    if (searchPulse.current != null) {
      window.clearInterval(searchPulse.current);
      searchPulse.current = null;
    }
    searchTick.current = 0;
  }, []);

  const startSearchPulse = useCallback(() => {
    clearSearchPulse();
    searchPulse.current = window.setInterval(() => {
      searchTick.current += 1;
      setPhase("searching");
      setPhaseDetail(searchFiller(searchTick.current, replyLangRef.current));
    }, 1000);
  }, [clearSearchPulse]);

  const fenceLocalTool = useCallback(() => {
    clearLocalTimers();
    clearSearchPulse();
    toolRunningRef.current = false;
    pendingResultRef.current = false;
  }, [clearLocalTimers, clearSearchPulse]);

  const pushLog = useCallback(
    (kind: Log["kind"], text: string) =>
      setLogs((x) => [{ kind, text: `${now()}  ${text}` }, ...x].slice(0, 28)),
    [],
  );

  const applyCity = useCallback(
    (city: string, opts?: { speak?: boolean }) => {
      const name = city.trim() || "Delhi";
      preferredCityRef.current = name;
      cityConfirmedRef.current = true;
      setPreferredCity(name);
      setCityConfirmed(true);
      setCityPrompt((p) => ({ ...p, open: false, changing: false }));
      if (session && session !== "pending") {
        void setSessionCity(session, name).catch(() => {
          /* local preferred city still works */
        });
      }
      const line = confirmCity(name, replyLangRef.current);
      if (opts?.speak !== false) {
        setTurns((x) => [...x, { role: "assistant", text: line, time: now() }]);
        void speakLine(line, {}, replyLangRef.current);
      }
      pushLog("turn", `CITY · ${name}`);
    },
    [pushLog, session],
  );

  const setPipeline = useCallback((next: PipelinePhase, detail?: string) => {
    setPhase(next);
    setPhaseDetail(detail);
    if (next !== "error") setBannerError(null);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (typeof window === "undefined" || !text.trim()) return;
      setPipeline("speaking");
      await speakLine(
        text,
        {
          onWaiting: () =>
            setPipeline(
              "speaking",
              replyLangRef.current === "hi" ? "Voice ready hone wali hai…" : "Voice almost ready…",
            ),
          onPlaying: () => setPipeline("speaking"),
          onDone: () => {
            // Honest searching pulse starts after ack TTS finishes (not during ack)
            if (toolRunningRef.current) {
              startSearchPulse();
              setPipeline("searching", searchFiller(searchTick.current, replyLangRef.current));
            } else {
              setPipeline("idle");
            }
          },
          onError: (message) => {
            pushLog("stale", `TTS · ${message}`);
            setBannerError(errTts());
            if (toolRunningRef.current) {
              startSearchPulse();
              setPipeline("searching", searchFiller(searchTick.current, replyLangRef.current));
            } else {
              setPipeline("idle");
            }
          },
        },
        replyLangRef.current,
      );
    },
    [pushLog, setPipeline, startSearchPulse],
  );

  const addAssistant = useCallback(
    (text: string) => {
      setTurns((x) => [...x, { role: "assistant", text, time: now() }]);
      void speak(text);
    },
    [speak],
  );

  const failLoud = useCallback(
    (message: string) => {
      fenceLocalTool();
      setBannerError(message);
      setPipeline("error", message);
      pushLog("stale", message);
      addAssistant(message);
    },
    [addAssistant, fenceLocalTool, pushLog, setPipeline],
  );

  const lineFromToolResult = useCallback((result: ToolResult, fallbackTask: Task | null) => {
    const lang = asReplyLang(result.reply_lang ?? replyLangRef.current);
    if (typeof result.summary === "string" && result.summary.trim()) {
      return result.summary.trim();
    }
    if (result.results?.length || result.count) {
      return resultFallbackFromTool(result, lang);
    }
    const params = result.params ?? {};
    const city = String(
      params["city"] ?? fallbackTask?.params.match(/city=([^ ·]+)/)?.[1] ?? "Delhi",
    );
    if (result.tool === "search_restaurants" || fallbackTask?.type === "restaurant") {
      const area = String(
        params["area"] ?? fallbackTask?.params.match(/area=([^ ·]+)/)?.[1] ?? city,
      );
      return resultRestaurants(area, lang);
    }
    const budget = String(
      params["budget"] ?? fallbackTask?.params.match(/budget=(\d+)/)?.[1] ?? "5000",
    );
    return resultHotels(city, budget, lang);
  }, []);

  const completeFromBackend = useCallback(
    (requestId: string, result: ToolResult, source: "ws" | "fallback") => {
      const hasCoords =
        Array.isArray(result.results) &&
        result.results.some(
          (row) =>
            row &&
            typeof row === "object" &&
            Number.isFinite(Number((row as { lat?: unknown }).lat)) &&
            Number.isFinite(Number((row as { lon?: unknown }).lon)),
        );

      // Live WS result may arrive after the local timeout spoke a synthetic
      // summary — still refresh the map / result card without re-speaking.
      if (source === "ws" && (spokenRequestRef.current === requestId || !pendingResultRef.current)) {
        if (hasCoords || (Array.isArray(result.results) && result.results.length > 0)) {
          lastResultRef.current = result;
          setLastResult(result);
          setStatus("COMPLETE");
          pushLog(
            "tool",
            `MAP refresh · ${result.source ?? "backend"} · ${result.count ?? result.results?.length ?? 0} places`,
          );
        }
        return;
      }

      if (!pendingResultRef.current) return;
      if (spokenRequestRef.current === requestId) return;

      if (result.reply_lang) setLang(asReplyLang(result.reply_lang));

      pendingResultRef.current = false;
      spokenRequestRef.current = requestId;
      clearLocalTimers();
      clearSearchPulse();
      toolRunningRef.current = false;
      setStatus("COMPLETE");
      setRequestId(requestId);
      pushLog(
        "tool",
        `COMPLETE ${result.tool ?? taskRef.current?.type ?? "tool"} · ${source} result → Rime`,
      );
      lastResultRef.current = result;
      setLastResult(result);
      if (typeof result.delay_seconds === "number") {
        setLatency((prev) => ({ ...prev, toolDelaySec: result.delay_seconds ?? null }));
      }
      if (ackStartedAtRef.current != null) {
        setLatency((prev) => ({
          ...prev,
          lastAckToCompleteMs: Date.now() - ackStartedAtRef.current!,
        }));
        ackStartedAtRef.current = null;
      }
      addAssistant(lineFromToolResult(result, taskRef.current));
    },
    [addAssistant, clearLocalTimers, clearSearchPulse, lineFromToolResult, pushLog, setLang],
  );

  const runTool = useCallback(
    (next: Task, nextTurn: number, interruptKind: Interrupt | null) => {
      stopSpeaking();
      clearLocalTimers();
      toolRunningRef.current = true;
      pendingResultRef.current = true;
      taskRef.current = next;
      spokenRequestRef.current = null;
      lastResultRef.current = null;
      setLastResult(null);
      setTask(next);
      setStatus("RUNNING");
      setRequestId(next.tool_call_id);
      pushLog("tool", `RUNNING ${next.type} · ${next.params}`);

      const lang = replyLangRef.current;
      const ack =
        interruptKind === "PIVOT"
          ? ackPivot(next.type, lang)
          : interruptKind === "REFINE"
            ? ackRefine(next.type, lang)
            : ackSearch(next.type, next.params, lang);

      setPipeline("acknowledging", ack);
      ackStartedAtRef.current = Date.now();
      addAssistant(ack);
      // Searching pulse starts after ack TTS (see speak onDone) — honest gap

      // Fallback only if backend never answers — don't invent mock place names.
      const fallbackMs = wsConnected ? 16000 : 4200;
      const fallbackId = window.setTimeout(() => {
        if (nextTurn !== currentTurn.current) return;
        if (!pendingResultRef.current) return;
        const p = next.params;
        const city = p.match(/city=([^ ·]+)/)?.[1] || preferredCityRef.current || "Delhi";
        const budget = p.match(/budget=(\d+)/)?.[1] || "5000";
        const synthetic: ToolResult = {
          tool: next.type === "restaurant" ? "search_restaurants" : "search_hotels",
          summary:
            next.type === "hotel"
              ? `Still waiting on live hotel results for ${city}…`
              : `Still waiting on live restaurant results for ${city}…`,
          params: { city, budget: Number(budget) },
          reply_lang: replyLangRef.current,
          source: "fallback",
          count: 0,
          results: [],
        };
        completeFromBackend(next.tool_call_id, synthetic, "fallback");
      }, fallbackMs);
      timers.current.push(fallbackId);
    },
    [addAssistant, clearLocalTimers, completeFromBackend, pushLog, setPipeline, wsConnected],
  );

  const cancelLocal = useCallback(() => {
    currentTurn.current += 1;
    setTurnId(currentTurn.current);
    setInterrupt("CANCEL");
    setStatus("CANCELLED");
    setTask(null);
    taskRef.current = null;
    lastResultRef.current = null;
    setLastResult(null);
    fenceLocalTool();
    pushLog("interrupt", "CANCEL · in-flight search fenced");
    addAssistant(ackCancel(replyLangRef.current));
  }, [addAssistant, fenceLocalTool, pushLog]);

  /** Tap constraint chip → drop filter → auto REFINE. */
  const removeConstraint = useCallback(
    (paramKey: string, label: string) => {
      const current = taskRef.current;
      if (!current) return;

      const nextParams = removeParamKey(current.params, paramKey, preferredCityRef.current);
      if (nextParams === current.params) return;

      const next: Task = {
        type: current.type,
        params: nextParams,
        tool_call_id: Math.random().toString(16).slice(2, 10),
      };

      void unlockAudio();
      const note = `Remove ${label}`;
      setTurns((x) => [...x, { role: "user", text: note, time: now() }]);
      pushLog("interrupt", `REFINE · removed ${paramKey}`);
      setInterrupt("REFINE");

      if (session && session !== "pending") {
        void sendTextMessage(session, note, "REFINE").catch((err) =>
          failLoud(errNetwork(err instanceof Error ? err.message : undefined)),
        );
      }

      currentTurn.current += 1;
      const n = currentTurn.current;
      setTurnId(n);
      runTool(next, n, "REFINE");
    },
    [failLoud, pushLog, runTool, session],
  );

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      stopSpeaking();
      void unlockAudio();
      setInput("");
      setTurns((x) => [...x, { role: "user", text, time: now() }]);
      pushLog("turn", `USER · ${text}`);
      setPipeline("understanding");
      setLang(detectReplyLang(text, replyLangRef.current));

      // Resume after city / budget ask
      if (pendingAsk === "city" || pendingAsk === "budget") {
        const draft = pendingDraftRef.current;
        if (draft) {
          if (pendingAsk === "city") {
            const cityHit = CITY_CHIPS.find((c) => text.toLowerCase().includes(c.toLowerCase()));
            const name =
              cityHit ||
              text
                .replace(/^(in|near|at)\s+/i, "")
                .trim()
                .split(/[\s,]/)[0];
            if (name && name.length > 1) {
              preferredCityRef.current = name;
              cityConfirmedRef.current = true;
              setPreferredCity(name);
              setCityConfirmed(true);
              if (session && session !== "pending") {
                void setSessionCity(session, name).catch(() => undefined);
              }
              const withCity: Task = {
                ...draft.task,
                params: [
                  `city=${name}`,
                  ...splitParams(draft.task.params).filter((p) => !p.startsWith("city=")),
                ].join(" · "),
                tool_call_id: Math.random().toString(16).slice(2, 10),
              };
              pendingDraftRef.current = { task: withCity, interrupt: draft.interrupt };
              setPendingAsk(null);
              if (
                withCity.type === "hotel" &&
                !/\bbudget=/.test(withCity.params) &&
                draft.interrupt !== "REFINE" &&
                draft.interrupt !== "PIVOT"
              ) {
                setPendingAsk("budget");
                addAssistant(askBudget(replyLangRef.current));
                return;
              }
              pendingDraftRef.current = null;
              currentTurn.current += 1;
              const n = currentTurn.current;
              setTurnId(n);
              setInterrupt(draft.interrupt);
              if (session && session !== "pending") {
                void sendTextMessage(session, text, draft.interrupt).catch(() => undefined);
              }
              runTool(withCity, n, draft.interrupt);
              return;
            }
          }
          if (pendingAsk === "budget") {
            const budget = text.match(/(\d{3,5})/)?.[1];
            if (budget) {
              const withBudget: Task = {
                ...draft.task,
                params: [
                  ...splitParams(draft.task.params).filter((p) => !p.startsWith("budget=")),
                  `budget=${budget}`,
                ].join(" · "),
                tool_call_id: Math.random().toString(16).slice(2, 10),
              };
              pendingDraftRef.current = null;
              setPendingAsk(null);
              currentTurn.current += 1;
              const n = currentTurn.current;
              setTurnId(n);
              setInterrupt(draft.interrupt);
              if (session && session !== "pending") {
                void sendTextMessage(session, `under ${budget}`, draft.interrupt).catch(
                  () => undefined,
                );
              }
              runTool(withBudget, n, draft.interrupt);
              return;
            }
          }
        }
      }

      const type = classifyInterrupt(text, task);

      // B10: mock book first after COMPLETE
      if (
        (status === "COMPLETE" || lastResultRef.current) &&
        /book (the )?first|book it|confirm (the )?booking|mock book/i.test(text)
      ) {
        const result = lastResultRef.current;
        const rows = Array.isArray(result?.results) ? result!.results! : [];
        const first = rows[0] as { name?: string; city?: string; area?: string } | undefined;
        const name = first?.name || "the top pick";
        const place = String(first?.area || first?.city || preferredCityRef.current || "Delhi");
        addAssistant(mockBookFirst(name, place, replyLangRef.current));
        pushLog("turn", "BOOK · mock hold on first result");
        return;
      }

      if (type === "FACT") {
        setInterrupt("FACT");
        pushLog("interrupt", "FACT · search continues (Wikipedia aside)");
        if (session && session !== "pending") {
          void sendTextMessage(session, text, "FACT")
            .then((res) => {
              if (res.reply_lang) setLang(asReplyLang(res.reply_lang));
              const line = res.fact_summary?.trim() || factFallback(asReplyLang(res.reply_lang));
              addAssistant(line);
              if (toolRunningRef.current) {
                setPipeline("searching", searchFiller(searchTick.current, replyLangRef.current));
              }
            })
            .catch((err) => failLoud(errNetwork(err instanceof Error ? err.message : undefined)));
        } else {
          addAssistant(factFallback(replyLangRef.current));
        }
        return;
      }

      if (status === "RUNNING" && type === "STATUS") {
        setInterrupt("STATUS");
        pushLog("interrupt", "STATUS · tool continues running");
        if (session && session !== "pending") {
          void sendTextMessage(session, text, "STATUS").catch(() => undefined);
        }
        addAssistant(ackStatus(task?.type, replyLangRef.current));
        return;
      }

      if (type === "STATUS") {
        setInterrupt("STATUS");
        addAssistant(ackStatus(task?.type, replyLangRef.current));
        return;
      }

      if (type === "CANCEL") {
        if (session && session !== "pending") {
          void sendTextMessage(session, text, "CANCEL").catch(() => undefined);
        }
        cancelLocal();
        return;
      }

      const mergePrev = status === "RUNNING" || status === "COMPLETE" ? task : null;
      const next = parseTask(text, mergePrev, preferredCityRef.current);
      const kind = type || (status === "RUNNING" ? "REFINE" : null);
      const cityFromParams = next.params.match(/city=([^ ·]+)/)?.[1];
      if (cityFromParams) {
        preferredCityRef.current = cityFromParams;
        cityConfirmedRef.current = true;
        setPreferredCity(cityFromParams);
        setCityConfirmed(true);
        if (session && session !== "pending") {
          void setSessionCity(session, cityFromParams).catch(() => undefined);
        }
      }

      if (!/\bcity=/.test(next.params)) {
        pendingDraftRef.current = { task: next, interrupt: kind };
        setPendingAsk("city");
        addAssistant(askCity(replyLangRef.current));
        return;
      }

      if (
        next.type === "hotel" &&
        !/\bbudget=/.test(next.params) &&
        kind !== "REFINE" &&
        kind !== "PIVOT" &&
        status !== "RUNNING"
      ) {
        pendingDraftRef.current = { task: next, interrupt: kind };
        setPendingAsk("budget");
        addAssistant(askBudget(replyLangRef.current));
        return;
      }

      if (session && session !== "pending") {
        void sendTextMessage(session, text, type)
          .then((res) => {
            if (res.reply_lang) setLang(asReplyLang(res.reply_lang));
            if (res.need_city) {
              fenceLocalTool();
              pendingDraftRef.current = { task: next, interrupt: kind };
              setPendingAsk("city");
              addAssistant(askCity(replyLangRef.current));
              return;
            }
            if (res.need_budget) {
              fenceLocalTool();
              pendingDraftRef.current = { task: next, interrupt: kind };
              setPendingAsk("budget");
              addAssistant(askBudget(replyLangRef.current));
            }
          })
          .catch((err) => failLoud(errNetwork(err instanceof Error ? err.message : undefined)));
      }

      currentTurn.current += 1;
      const n = currentTurn.current;
      setTurnId(n);
      setInterrupt(kind);
      if (status === "RUNNING") pushLog("interrupt", `${kind || "REFINE"} · old task fenced`);
      runTool(next, n, kind);
    },
    [
      addAssistant,
      cancelLocal,
      failLoud,
      fenceLocalTool,
      pendingAsk,
      pushLog,
      runTool,
      session,
      setLang,
      setPipeline,
      status,
      task,
    ],
  );

  const runJudgeDemo = useCallback(
    (demo: JudgeDemo) => {
      if (demoRunning) return;
      setDemoRunning(demo.id);
      pushLog("turn", `DEMO · ${demo.id}`);
      // Ensure city is confirmed so scripts don't stall on Kaunsa city?
      if (!cityConfirmedRef.current) {
        applyCity("Delhi", { speak: false });
      }
      const cancelled = false;
      const timersLocal: number[] = [];
      demo.steps.forEach((step) => {
        const id = window.setTimeout(() => {
          if (cancelled) return;
          submit(step.utterance);
          if (step === demo.steps[demo.steps.length - 1]) {
            window.setTimeout(() => setDemoRunning(null), 500);
          }
        }, step.delayMs);
        timersLocal.push(id);
      });
      timers.current.push(...timersLocal);
    },
    [applyCity, demoRunning, pushLog, submit],
  );

  // Speak real backend tool results (and keep DebugPanel numbers in sync)
  useEffect(() => {
    if (!wsState) return;

    if (typeof wsState.stale_discarded === "number") {
      setStale(wsState.stale_discarded);
    }
    if (typeof wsState.turn_id === "number" && wsState.turn_id > currentTurn.current) {
      currentTurn.current = wsState.turn_id;
      setTurnId(wsState.turn_id);
    }
    if (wsState.last_interrupt_type) {
      setInterrupt(wsState.last_interrupt_type as Interrupt);
    }

    if (wsState.tool_status === "RUNNING" && wsState.active_request_id) {
      setStatus("RUNNING");
      setRequestId(wsState.active_request_id);
      if (toolRunningRef.current && taskRef.current) {
        const remoteType = wsState.current_task["type"];
        taskRef.current = {
          ...taskRef.current,
          tool_call_id: wsState.active_request_id,
          type:
            remoteType === "hotel" || remoteType === "restaurant"
              ? remoteType
              : taskRef.current.type,
        };
        setTask(taskRef.current);
      }
    }

    if (wsState.tool_status === "CANCELLED") {
      setStatus("CANCELLED");
      // Don't speak cancel twice if we already handled locally
      fenceLocalTool();
      return;
    }

    if (wsState.tool_status === "COMPLETE" && wsState.last_tool_result) {
      const remoteCallId = wsState.current_task["tool_call_id"];
      const req =
        wsState.active_request_id ||
        (typeof remoteCallId === "string" ? remoteCallId : null) ||
        spokenRequestRef.current ||
        `turn-${wsState.turn_id}`;
      completeFromBackend(req, wsState.last_tool_result, "ws");
    }
  }, [completeFromBackend, fenceLocalTool, wsState]);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;

    const bootSession = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const created = await createSession();
          if (cancelled) return;
          setSession(created.session_id);
          const city = (created.detected_city || "Delhi").trim() || "Delhi";
          // Display suggestion only — don't invent preferred until Yes / Change
          preferredCityRef.current = "";
          cityConfirmedRef.current = false;
          setPreferredCity(city);
          setCityConfirmed(false);
          const greeting = created.greeting?.trim() || greetCity(city, replyLangRef.current);
          setCityPrompt({
            open: true,
            changing: false,
            greeting,
            isLocal: Boolean(created.is_local),
          });
          setTurns((x) => [...x, { role: "assistant", text: greeting, time: now() }]);
          void speakLine(greeting, {}, replyLangRef.current);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        }
      }
      if (!cancelled) {
        setSession("pending");
        setBannerError("Backend session nahi bani — backend :8000 check karo.");
        setPipeline("error", "Session create failed");
      }
    };

    void bootSession();

    return () => {
      cancelled = true;
      clearLocalTimers();
      if (searchPulse.current != null) window.clearInterval(searchPulse.current);
      stopSpeaking();
    };
  }, [clearLocalTimers, setPipeline]);

  const showMapPanel =
    status === "RUNNING" || status === "COMPLETE" || Boolean(lastResult);
  const searchCity =
    task?.params.match(/city=([^ ·]+)/)?.[1] || preferredCity || "Delhi";

  return (
    <main
      className="relative mx-auto min-h-screen max-w-[1440px] px-4 pb-20 sm:px-8 lg:px-12"
      onPointerDownCapture={() => {
        void unlockAudio();
      }}
      onKeyDownCapture={() => {
        void unlockAudio();
      }}
    >
      <Backdrop />
      <SiteHeader tagline="interruptible intelligence" />

      <section className="relative z-10 mx-auto max-w-5xl py-16 text-center sm:py-24">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-5 text-xs font-semibold tracking-[.28em] text-brand-cyan"
        >
          DATAFORGE 2026 · INDIA-FIRST VOICE AI
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.6, ease: "easeOut" }}
          className="text-balance text-5xl font-semibold tracking-[-.065em] sm:text-7xl lg:text-8xl"
        >
          A voice agent that stays <span className="gradient-text">correct</span> when you change
          your mind.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.6 }}
          className="mx-auto mt-7 max-w-2xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg"
        >
          The first voice booking agent designed for the sentence that usually breaks automation:
          “Actually, wait…”
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="mt-8 flex flex-wrap justify-center gap-2 text-xs"
        >
          {interruptCards.map((card) => (
            <span
              key={card.type}
              className={`rounded-full border px-3 py-1.5 ${accentStyles[card.accent].chip}`}
            >
              {card.type}
            </span>
          ))}
        </motion.div>
      </section>

      <section
        className={`relative z-10 grid gap-6 transition-all duration-500 ${
          showMapPanel
            ? "lg:grid-cols-[minmax(17rem,1.1fr)_minmax(0,0.9fr)_20rem]"
            : "lg:grid-cols-[minmax(0,1fr)_22rem]"
        }`}
      >
        <AnimatePresence initial={false}>
          {showMapPanel ? (
            <PlacesPanel
              key="places-panel"
              result={lastResult}
              searching={status === "RUNNING"}
              city={searchCity}
            />
          ) : null}
        </AnimatePresence>

        <motion.div
          layout
          transition={{ type: "spring", stiffness: 280, damping: 28 }}
          className={`glass-card p-5 sm:p-7 ${showMapPanel ? "lg:max-w-none" : ""}`}
        >
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Radio className="size-4 text-brand-cyan" />
                Live conversation
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Click mic to talk · click again to send
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              session_{mounted ? session : "pending"}
            </span>
          </div>

          <Transcript
            turns={turns}
            isBusy={
              recording ||
              sendingAudio ||
              phase === "searching" ||
              phase === "understanding" ||
              phase === "acknowledging" ||
              phase === "uploading" ||
              phase === "speaking"
            }
            busyLabel={
              recording
                ? phaseLabel("recording", undefined, replyLang)
                : sendingAudio
                  ? phaseLabel("uploading", undefined, replyLang)
                  : phaseLabel(phase, phaseDetail, replyLang) ||
                    (replyLang === "hi" ? "Vaani soch rahi hai…" : "Vaani is thinking…")
            }
          />

          {sttDegraded ? (
            <div
              role="status"
              className="mt-3 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-foreground"
            >
              Mic STT unavailable — <span className="font-semibold">type below</span> to continue
              the demo. Rime TTS still works.
            </div>
          ) : null}

          {bannerError ? (
            <div
              role="alert"
              className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-brand-rose"
            >
              {bannerError}
            </div>
          ) : null}

          {cityPrompt.open ? (
            <div className="mt-3 rounded-xl border border-primary/25 bg-primary/5 px-3 py-3 text-left">
              <p className="text-sm font-medium">{cityPrompt.greeting}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Near <span className="font-semibold text-foreground">{preferredCity}</span>
                {cityPrompt.isLocal ? " · localhost/VPN may be wrong — change freely" : ""}
              </p>
              {!cityPrompt.changing ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    onClick={() => {
                      void unlockAudio();
                      applyCity(preferredCity);
                    }}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-border bg-background/70 px-3 py-1.5 text-xs font-medium"
                    onClick={() => {
                      void unlockAudio();
                      setCityPrompt((p) => ({ ...p, changing: true }));
                    }}
                  >
                    Change city
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {CITY_CHIPS.map((city) => (
                    <button
                      key={city}
                      type="button"
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        city === preferredCity
                          ? "border-primary/40 bg-primary/15 font-semibold"
                          : "border-border bg-background/70"
                      }`}
                      onClick={() => {
                        void unlockAudio();
                        applyCity(city);
                      }}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Searching near <span className="font-medium text-foreground">{preferredCity}</span>
              {" · "}
              <button
                type="button"
                className="underline-offset-2 hover:underline"
                onClick={() => {
                  void unlockAudio();
                  setCityPrompt({
                    open: true,
                    changing: true,
                    greeting: greetCity(preferredCity, replyLang),
                    isLocal: false,
                  });
                }}
              >
                change city
              </button>
            </p>
          )}

          {task ? (
            <div className="mt-3">
              <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Active filters · tap to remove
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {paramsToChips(task.params, replyLang).map((chip) => (
                  <button
                    key={`${chip.paramKey}=${chip.value}`}
                    type="button"
                    title={`Remove ${chip.key}`}
                    onClick={() => removeConstraint(chip.paramKey, chip.label)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-brand-violet transition hover:border-destructive/40 hover:bg-destructive/10 hover:text-brand-rose"
                  >
                    <span className="opacity-60">{chip.key}</span>
                    <span>{chip.label}</span>
                    <span aria-hidden className="text-[10px] opacity-70">
                      ×
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {status === "COMPLETE" && task ? (
            <div className="mt-3">
              <p className="mb-1.5 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                Next · one tap
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {FOLLOW_UP_CHIPS.map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      void unlockAudio();
                      stopSpeaking();
                      submit(chip.utterance);
                    }}
                    className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-brand-cyan transition hover:border-accent/50 hover:bg-accent/20"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col items-center border-t border-border pt-6">
            <PushToTalk
              sessionId={session}
              disabled={!mounted || session === "pending"}
              onBargeIn={() => {
                stopSpeaking();
                void unlockAudio();
              }}
              onRecordingChange={(isRec) => {
                setRecording(isRec);
                if (isRec) {
                  setBannerError(null);
                  setPipeline("recording");
                }
              }}
              onBusyChange={(busy) => {
                setSendingAudio(busy);
                if (busy) setPipeline("uploading");
              }}
              onSent={(result) => {
                const {
                  turn_id,
                  transcript,
                  interrupt_type,
                  reply_lang,
                  fact_summary,
                  need_city,
                  need_budget,
                } = result;
                const spoken = transcript?.trim();
                if (!spoken) {
                  failLoud(errSttEmpty());
                  return;
                }

                if (reply_lang) setLang(asReplyLang(reply_lang));
                setPipeline("understanding");

                if (typeof turn_id === "number") {
                  currentTurn.current = turn_id;
                  setTurnId(turn_id);
                }

                setTurns((x) => [...x, { role: "user", text: spoken, time: now() }]);
                pushLog("turn", `USER · ${spoken} (voice/STT)`);

                const type =
                  (interrupt_type as Interrupt | null) || classifyInterrupt(spoken, task);
                setInterrupt(type);

                if (type === "FACT") {
                  pushLog("interrupt", "FACT · search continues (Wikipedia aside)");
                  const line = fact_summary?.trim() || factFallback(asReplyLang(reply_lang));
                  addAssistant(line);
                  if (toolRunningRef.current || status === "RUNNING") {
                    setPipeline(
                      "searching",
                      searchFiller(searchTick.current, replyLangRef.current),
                    );
                  }
                  return;
                }

                if (status === "RUNNING" && type === "STATUS") {
                  pushLog("interrupt", "STATUS · tool continues running");
                  addAssistant(ackStatus(task?.type, replyLangRef.current));
                  return;
                }

                if (type === "STATUS") {
                  addAssistant(ackStatus(task?.type, replyLangRef.current));
                  return;
                }

                if (type === "CANCEL") {
                  cancelLocal();
                  return;
                }

                if (need_city) {
                  const draft = parseTask(
                    spoken,
                    status === "RUNNING" || status === "COMPLETE" ? task : null,
                    preferredCityRef.current,
                  );
                  pendingDraftRef.current = {
                    task: draft,
                    interrupt: type || (status === "RUNNING" ? "REFINE" : null),
                  };
                  setPendingAsk("city");
                  addAssistant(askCity(replyLangRef.current));
                  return;
                }
                if (need_budget) {
                  const draft = parseTask(
                    spoken,
                    status === "RUNNING" || status === "COMPLETE" ? task : null,
                    preferredCityRef.current,
                  );
                  pendingDraftRef.current = {
                    task: draft,
                    interrupt: type || (status === "RUNNING" ? "REFINE" : null),
                  };
                  setPendingAsk("budget");
                  addAssistant(askBudget(replyLangRef.current));
                  return;
                }

                const next = parseTask(
                  spoken,
                  status === "RUNNING" || status === "COMPLETE" ? task : null,
                  preferredCityRef.current,
                );
                const kind = type || (status === "RUNNING" ? "REFINE" : null);

                if (!/\bcity=/.test(next.params)) {
                  pendingDraftRef.current = { task: next, interrupt: kind };
                  setPendingAsk("city");
                  addAssistant(askCity(replyLangRef.current));
                  return;
                }
                if (
                  next.type === "hotel" &&
                  !/\bbudget=/.test(next.params) &&
                  kind !== "REFINE" &&
                  kind !== "PIVOT" &&
                  status !== "RUNNING"
                ) {
                  pendingDraftRef.current = { task: next, interrupt: kind };
                  setPendingAsk("budget");
                  addAssistant(askBudget(replyLangRef.current));
                  return;
                }

                if (status === "RUNNING") {
                  pushLog("interrupt", `${kind || "REFINE"} · old task fenced`);
                }
                const n = typeof turn_id === "number" ? turn_id : currentTurn.current + 1;
                currentTurn.current = n;
                setTurnId(n);
                setRequestId(next.tool_call_id);
                runTool(next, n, kind);
              }}
              onError={(message) => {
                const sttDown =
                  /STT|type karke|Speech-to-text|Access denied|Groq/i.test(message) ||
                  message === errSttFailed();
                if (sttDown) {
                  setSttDegraded(true);
                  setBannerError(message);
                  setPipeline("idle");
                  pushLog("stale", message);
                  addAssistant(message);
                  window.setTimeout(() => inputRef.current?.focus(), 50);
                  return;
                }
                failLoud(message);
              }}
            />

            <div className="mt-5 flex w-full gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onFocus={() => {
                  stopSpeaking();
                  void unlockAudio();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    void unlockAudio();
                    stopSpeaking();
                    submit(input);
                  }
                }}
                placeholder="Type an interruption… Hinglish chalega"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
              />
              <motion.button
                type="button"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                onPointerDown={() => {
                  void unlockAudio();
                  stopSpeaking();
                }}
                onClick={() => {
                  void unlockAudio();
                  stopSpeaking();
                  submit(input);
                }}
                aria-label="Send"
                className="grid place-items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
              >
                <ArrowUpRight className="size-4" />
              </motion.button>
            </div>
          </div>
        </motion.div>

        <div className="flex flex-col gap-4">
          <DebugPanel state={wsState} connected={wsConnected} latency={latency} />

          <aside className="glass-card p-5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Zap className="size-3 text-brand-amber" /> event stream
            </div>
            <div className="rounded-xl border border-border bg-background/50 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
              <AnimatePresence initial={false}>
                {logs.length ? (
                  logs.slice(0, 7).map((log) => (
                    <motion.div
                      key={log.text}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className={log.kind === "stale" ? "text-brand-rose" : ""}
                    >
                      {log.text}
                    </motion.div>
                  ))
                ) : (
                  <span>Awaiting first turn…</span>
                )}
              </AnimatePresence>
            </div>
          </aside>
        </div>
      </section>

      <section className="relative z-10 py-20">
        <SectionTitle
          eyebrow="INTERRUPTION INTELLIGENCE"
          title="Every “wait” has a different meaning."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {JUDGE_DEMOS.map((demo) => (
            <button
              key={demo.id}
              type="button"
              disabled={Boolean(demoRunning)}
              title={demo.description}
              onClick={() => {
                void unlockAudio();
                runJudgeDemo(demo);
              }}
              className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-wide transition ${
                demoRunning === demo.id
                  ? "border-brand-amber/50 bg-brand-amber/15 text-brand-amber"
                  : "border-border bg-card/60 text-muted-foreground hover:border-brand-violet/40 hover:text-foreground"
              } disabled:opacity-50`}
            >
              Demo · {demo.label}
            </button>
          ))}
        </div>
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {interruptCards.map((card, i) => (
            <InterruptCard
              key={card.type}
              card={card}
              index={i}
              onTry={() => setInput(card.utterance)}
            />
          ))}
        </div>
      </section>

      <Stats />

      <section className="relative z-10 py-20">
        <SectionTitle eyebrow="SCENARIO PLAYGROUND" title="Skip the happy path." />
        <div className="mt-8 flex flex-wrap gap-2">
          {chips.map((chip, i) => (
            <motion.button
              key={chip}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ delay: i * 0.06, duration: 0.4 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setInput(chip)}
              className="rounded-full border border-border bg-card/60 px-4 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-brand-violet/40 hover:text-foreground"
            >
              {i === 0 ? "Try the demo · " : ""}
              {chip}
            </motion.button>
          ))}
        </div>
      </section>
    </main>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ duration: 0.5 }}
    >
      <p className="text-xs font-semibold tracking-[.24em] text-brand-cyan">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-[-.04em] sm:text-5xl">{title}</h2>
    </motion.div>
  );
}

function InterruptCard({
  card,
  index,
  onTry,
}: {
  card: (typeof interruptCards)[number];
  index: number;
  onTry: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 25 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ delay: index * 0.08, duration: 0.45, ease: "easeOut" }}
      whileHover={{ y: -8 }}
      whileTap={{ scale: 0.98 }}
      onClick={onTry}
      className={`group flex h-full flex-col rounded-2xl border border-border bg-card/50 p-5 text-left transition-colors hover:bg-card ${accentStyles[card.accent].hover}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`rounded-full border px-2 py-1 text-[10px] font-bold tracking-[.2em] ${accentStyles[card.accent].chip}`}
        >
          {card.type}
        </span>
        <ArrowUpRight className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-foreground" />
      </div>
      <p className="mt-8 min-h-14 flex-1 text-sm leading-6 text-foreground/90">
        {card.description}
      </p>
      <div className="mt-5 border-t border-border pt-4 text-xs italic text-muted-foreground transition-colors group-hover:text-foreground">
        “{card.utterance}”
      </div>
    </motion.button>
  );
}

function Stats() {
  const items = [
    ["100%", "stale block rate"],
    ["$0", "cost to recover"],
    ["<2000ms", "recovery target"],
    ["4", "interrupt types"],
  ];

  return (
    <section className="relative z-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
      {items.map(([value, label], i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ delay: i * 0.1, duration: 0.45 }}
          className="bg-card p-6"
        >
          <div className="font-mono text-3xl font-semibold text-foreground">{value}</div>
          <div className="mt-2 text-xs uppercase tracking-[.18em] text-muted-foreground">
            {label}
          </div>
        </motion.div>
      ))}
    </section>
  );
}
