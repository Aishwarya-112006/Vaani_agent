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
  CITY_CHIPS,
  confirmCity,
  errNetwork,
  errSttEmpty,
  errTts,
  greetCity,
  phaseLabel,
  resultHotels,
  resultRestaurants,
  searchFiller,
  type PipelinePhase,
  type ReplyLang,
} from "@/lib/copy";
import { speakLine, stopSpeaking } from "@/lib/speak";
import { detectReplyLang } from "@/lib/lang";
import { useWebSocket, type ToolResult } from "@/hooks/useWebSocket";

import { Backdrop } from "./backdrop";
import { DebugPanel } from "./DebugPanel";
import { PushToTalk } from "./PushToTalk";
import { SiteHeader } from "./site-header";
import { Transcript, type Turn } from "./Transcript";

type Interrupt = "REFINE" | "CANCEL" | "STATUS" | "PIVOT";
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
    type: "PIVOT",
    accent: "amber",
    utterance: "Find restaurants there instead.",
    description: "Switch domains and invalidate the previous result.",
  },
];

function now() {
  return new Date().toLocaleTimeString([], { hour12: false });
}

function classify(text: string, task: Task | null): Interrupt | null {
  const s = text.toLowerCase();
  if (/what are you|are you still|how long|status/.test(s)) return "STATUS";
  if (/forget it|never mind|stop searching|cancel|stop it/.test(s)) return "CANCEL";
  if (
    task &&
    ((task.type === "hotel" && /restaurant|food|eat|dinner|cafe|cuisine|thali|lunch/.test(s)) ||
      (task.type === "restaurant" && /\bhotels?\b|\bstay\b|\broom\b/.test(s)))
  )
    return "PIVOT";
  if (task && /actually|only|vegetarian|veg|under|metro|near|rupees|₹|cuisine|area/.test(s))
    return "REFINE";
  return null;
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

function parseTask(text: string, previous?: Task | null, defaultCity = "Delhi"): Task {
  const s = text.toLowerCase();
  const type = resolveTaskType(text, previous);
  const city = [
    "Delhi",
    "Mumbai",
    "Bangalore",
    "Hyderabad",
    "Chennai",
    "Pune",
    "Kolkata",
    "Goa",
    "Jaipur",
  ].find((x) => s.includes(x.toLowerCase()));
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
    merged.unshift(`city=${defaultCity}`);
  }

  return {
    type,
    params:
      merged.join(" · ") ||
      (type === "hotel"
        ? `city=${defaultCity}`
        : `city=${defaultCity} · area=Connaught Place · cuisine=Indian`),
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
  const [replyLang, setReplyLang] = useState<ReplyLang>("en");
  const [preferredCity, setPreferredCity] = useState("Delhi");
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
  const replyLangRef = useRef<ReplyLang>("en");
  const preferredCityRef = useRef("Delhi");

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
      setPreferredCity(name);
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
            if (toolRunningRef.current) {
              setPipeline("searching", searchFiller(searchTick.current, replyLangRef.current));
            } else {
              setPipeline("idle");
            }
          },
          onError: (message) => {
            pushLog("stale", `TTS · ${message}`);
            setBannerError(errTts());
          },
        },
        replyLangRef.current,
      );
    },
    [pushLog, setPipeline],
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
      addAssistant(ack);
      startSearchPulse();

      // Fallback if WebSocket / backend result never arrives
      const fallbackId = window.setTimeout(() => {
        if (nextTurn !== currentTurn.current) return;
        if (!pendingResultRef.current) return;
        const p = next.params;
        const city = p.match(/city=([^ ·]+)/)?.[1] || "Delhi";
        const budget = p.match(/budget=(\d+)/)?.[1] || "5000";
        const synthetic: ToolResult = {
          tool: next.type === "restaurant" ? "search_restaurants" : "search_hotels",
          summary:
            next.type === "hotel"
              ? resultHotels(city, budget, replyLangRef.current)
              : resultRestaurants(p.match(/area=([^ ·]+)/)?.[1] || city, replyLangRef.current),
          params: { city, budget: Number(budget) },
          reply_lang: replyLangRef.current,
        };
        completeFromBackend(next.tool_call_id, synthetic, "fallback");
      }, 4200);
      timers.current.push(fallbackId);
    },
    [addAssistant, clearLocalTimers, completeFromBackend, pushLog, setPipeline, startSearchPulse],
  );

  const cancelLocal = useCallback(() => {
    currentTurn.current += 1;
    setTurnId(currentTurn.current);
    setInterrupt("CANCEL");
    setStatus("CANCELLED");
    setTask(null);
    taskRef.current = null;
    fenceLocalTool();
    pushLog("interrupt", "CANCEL · in-flight search fenced");
    addAssistant(ackCancel(replyLangRef.current));
  }, [addAssistant, fenceLocalTool, pushLog]);

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setInput("");
      setTurns((x) => [...x, { role: "user", text, time: now() }]);
      pushLog("turn", `USER · ${text}`);
      setPipeline("understanding");

      // Apply language immediately so ack/TTS match the typed utterance
      setLang(detectReplyLang(text, replyLangRef.current));

      const type = classify(text, task);

      if (session && session !== "pending") {
        void sendTextMessage(session, text, type)
          .then((res) => {
            if (res.reply_lang) setLang(asReplyLang(res.reply_lang));
          })
          .catch((err) => failLoud(errNetwork(err instanceof Error ? err.message : undefined)));
      }

      if (status === "RUNNING" && type === "STATUS") {
        setInterrupt("STATUS");
        pushLog("interrupt", "STATUS · tool continues running");
        addAssistant(ackStatus(task?.type, replyLangRef.current));
        return;
      }

      if (type === "STATUS") {
        setInterrupt("STATUS");
        addAssistant(ackStatus(task?.type, replyLangRef.current));
        return;
      }

      if (type === "CANCEL") {
        cancelLocal();
        return;
      }

      const next = parseTask(text, status === "RUNNING" ? task : null, preferredCityRef.current);
      currentTurn.current += 1;
      const n = currentTurn.current;
      setTurnId(n);
      const kind = type || (status === "RUNNING" ? "REFINE" : null);
      setInterrupt(kind);
      if (status === "RUNNING") pushLog("interrupt", `${kind || "REFINE"} · old task fenced`);
      // Prefer backend request id when the POST returns later — for now use local id;
      // WS completion matches via turn_id + result payload.
      runTool(next, n, kind);
    },
    [
      addAssistant,
      cancelLocal,
      failLoud,
      pushLog,
      runTool,
      session,
      setLang,
      setPipeline,
      status,
      task,
    ],
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
          preferredCityRef.current = city;
          setPreferredCity(city);
          const greeting =
            created.greeting?.trim() || greetCity(city, replyLangRef.current);
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

      <section className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="glass-card p-5 sm:p-7">
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

          <div className="mt-6 flex flex-col items-center border-t border-border pt-6">
            <PushToTalk
              sessionId={session}
              disabled={!mounted || session === "pending"}
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
              onSent={({ turn_id, transcript, interrupt_type, reply_lang }) => {
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

                const type = (interrupt_type as Interrupt | null) || classify(spoken, task);
                setInterrupt(type);

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

                const next = parseTask(
                  spoken,
                  status === "RUNNING" ? task : null,
                  preferredCityRef.current,
                );
                const kind = type || (status === "RUNNING" ? "REFINE" : null);
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
                // Mic/recording errors are not network failures
                failLoud(message);
              }}
            />

            <div className="mt-5 flex w-full gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    void unlockAudio();
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
                }}
                onClick={() => {
                  void unlockAudio();
                  submit(input);
                }}
                aria-label="Send"
                className="grid place-items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:brightness-110"
              >
                <ArrowUpRight className="size-4" />
              </motion.button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <DebugPanel state={wsState} connected={wsConnected} />

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
