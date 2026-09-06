import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Radio, Zap } from "lucide-react";

import { createSession, sendTextMessage } from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";

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
    ((task.type === "hotel" && /restaurant|food|eat|dinner|cafe/.test(s)) ||
      (task.type === "restaurant" && /hotel/.test(s)))
  )
    return "PIVOT";
  if (task && /actually|only|vegetarian|veg|under|metro|near|rupees|₹/.test(s)) return "REFINE";
  return null;
}

function parseTask(text: string, previous?: Task | null): Task {
  const s = text.toLowerCase();
  const type: Task["type"] = /restaurant|food|eat|dinner|cafe/.test(s) ? "restaurant" : "hotel";
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
  ].find((x) => s.includes(x.toLowerCase()));
  const budget = text.match(/(?:under|₹)\s?(\d{3,5})/i)?.[1];
  const values = [
    city ? `city=${city}` : "",
    area ? `area=${area}` : "",
    budget ? `budget=${budget}` : "",
    /vegetarian|veg/.test(s) ? "veg_only=true" : "",
    /metro/.test(s) ? "near_metro=true" : "",
  ].filter(Boolean);

  const merged = previous?.params.split(" · ").filter(Boolean) ?? [];
  values.forEach((value) => {
    const key = value.split("=")[0];
    const index = merged.findIndex((x) => x.startsWith(`${key}=`));
    if (index >= 0) merged[index] = value;
    else merged.push(value);
  });

  return {
    type,
    params: merged.join(" · ") || (type === "hotel" ? "city=Delhi" : "area=Connaught Place"),
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

  // Real-time backend state via WebSocket
  const { state: wsState, connected: wsConnected } = useWebSocket(mounted ? session : null);

  const currentTurn = useRef(0);
  const timers = useRef<number[]>([]);

  const pushLog = useCallback(
    (kind: Log["kind"], text: string) =>
      setLogs((x) => [{ kind, text: `${now()}  ${text}` }, ...x].slice(0, 28)),
    [],
  );

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    window.speechSynthesis.speak(utterance);
  }, []);

  const addAssistant = useCallback(
    (text: string) => {
      setTurns((x) => [...x, { role: "assistant", text, time: now() }]);
      speak(text);
    },
    [speak],
  );

  const runTool = useCallback(
    (next: Task, nextTurn: number) => {
      setTask(next);
      setStatus("RUNNING");
      setRequestId(next.tool_call_id);
      pushLog("tool", `RUNNING ${next.type} · ${next.params}`);

      const id = window.setTimeout(() => {
        if (nextTurn !== currentTurn.current) {
          setStale((x) => x + 1);
          setStatus((s) => (s === "RUNNING" ? "IDLE" : s));
          pushLog("stale", `STALE BLOCKED — turn ${nextTurn} ≠ current ${currentTurn.current}`);
          return;
        }
        setStatus("COMPLETE");
        pushLog("tool", `COMPLETE ${next.type} · fresh result reached Rime`);
        const p = next.params;
        const city = p.match(/city=([^ ·]+)/)?.[1] || "Delhi";
        const budget = p.match(/budget=(\d+)/)?.[1] || "5000";
        const result =
          next.type === "hotel"
            ? `I found 3 hotels in ${city} under ₹${budget}. Top pick: The Lotus Residency, breakfast included.`
            : `I found 3 restaurants in ${p.match(/area=([^ ·]+)/)?.[1] || city}. Top pick: Saffron Thali, highly rated and open now.`;
        addAssistant(result);
      }, 4000);

      timers.current.push(id);
    },
    [addAssistant, pushLog],
  );

  const submit = useCallback(
    (raw: string) => {
      const text = raw.trim();
      if (!text) return;
      setInput("");
      setTurns((x) => [...x, { role: "user", text, time: now() }]);
      pushLog("turn", `USER · ${text}`);

      const type = classify(text, task);

      if (session && session !== "pending") {
        void sendTextMessage(session, text, type).catch((err) =>
          pushLog("stale", err instanceof Error ? err.message : "message failed"),
        );
      }

      if (status === "RUNNING" && type === "STATUS") {
        setInterrupt("STATUS");
        pushLog("interrupt", "STATUS · tool continues running");
        addAssistant(
          `Still searching for ${task?.type ?? "results"}. I will speak the result as soon as it is ready.`,
        );
        return;
      }

      if (type === "CANCEL") {
        currentTurn.current += 1;
        setTurnId(currentTurn.current);
        setInterrupt("CANCEL");
        setStatus("CANCELLED");
        setTask(null);
        pushLog("interrupt", "CANCEL · in-flight search fenced");
        addAssistant("Okay, I have stopped the search. What would you like instead?");
        return;
      }

      const next = parseTask(text, status === "RUNNING" ? task : null);
      currentTurn.current += 1;
      const n = currentTurn.current;
      setTurnId(n);
      setInterrupt(type || (status === "RUNNING" ? "REFINE" : null));
      if (status === "RUNNING") pushLog("interrupt", `${type || "REFINE"} · old task fenced`);
      runTool(next, n);
    },
    [addAssistant, pushLog, runTool, session, status, task],
  );

  useEffect(() => {
    setMounted(true);
    let cancelled = false;

    createSession()
      .then((created) => {
        if (!cancelled) setSession(created.session_id);
      })
      .catch(() => {
        if (!cancelled) setSession(crypto.randomUUID());
      });

    const pending = timers.current;
    return () => {
      cancelled = true;
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <main className="relative mx-auto min-h-screen max-w-[1440px] px-4 pb-20 sm:px-8 lg:px-12">
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
              <p className="mt-1 text-xs text-muted-foreground">Hold to talk · release to send</p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              session_{mounted ? session : "pending"}
            </span>
          </div>

          <Transcript turns={turns} isBusy={status === "RUNNING" || sendingAudio} />

          <div className="mt-6 flex flex-col items-center border-t border-border pt-6">
            <PushToTalk
              sessionId={session}
              disabled={!mounted || session === "pending"}
              onBusyChange={setSendingAudio}
              onSent={({ turn_id, transcript, interrupt_type }) => {
                const spoken = transcript?.trim();
                if (!spoken) {
                  pushLog("stale", "STT returned empty transcript");
                  return;
                }

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
                  addAssistant(
                    `Still searching for ${task?.type ?? "results"}. I will speak the result as soon as it is ready.`,
                  );
                  return;
                }

                if (type === "CANCEL") {
                  setStatus("CANCELLED");
                  setTask(null);
                  pushLog("interrupt", "CANCEL · in-flight search fenced");
                  addAssistant("Okay, I have stopped the search. What would you like instead?");
                  return;
                }

                const next = parseTask(spoken, status === "RUNNING" ? task : null);
                if (status === "RUNNING") {
                  pushLog("interrupt", `${type || "REFINE"} · old task fenced`);
                }
                const n = typeof turn_id === "number" ? turn_id : currentTurn.current + 1;
                currentTurn.current = n;
                setTurnId(n);
                setRequestId(next.tool_call_id);
                runTool(next, n);
              }}
              onError={(message) => pushLog("stale", message)}
            />

            <div className="mt-5 flex w-full gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(input);
                }}
                placeholder="Type an interruption…"
                className="min-w-0 flex-1 rounded-xl border border-border bg-background/60 px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-accent/50 focus:ring-2 focus:ring-accent/20"
              />
              <motion.button
                type="button"
                whileHover={{ y: -2 }}
                whileTap={{ scale: 0.96 }}
                onClick={() => submit(input)}
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
