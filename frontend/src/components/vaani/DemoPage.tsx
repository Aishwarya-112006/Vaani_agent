import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Backdrop } from "@/components/vaani/backdrop";
import { SiteHeader } from "@/components/vaani/site-header";

const STEPS = [
  {
    n: "01",
    title: "Confirm city",
    body: "Yes on the greeting — or Change city. Only known cities are accepted (no Actually / metro pollution).",
  },
  {
    n: "02",
    title: "Start a search",
    body: "Find hotels in Delhi under ₹5000 — confirm line, searching pulse (~4–5s window). Live map opens on the left.",
  },
  {
    n: "03",
    title: "Interrupt mid-flight",
    body: "Tap REFINE / STATUS / FACT / PIVOT / CANCEL in the conversation card (always visible), or type Actually, near metro. Or use Demo · chips below.",
  },
  {
    n: "04",
    title: "After COMPLETE",
    body: "Cheaper? · Metro? · Veg? · Restaurants? · Book first? · Same · Mumbai — one-tap refine / pivot / mock book.",
  },
  {
    n: "05",
    title: "Show the judge panel",
    body: "turn_id · tool_status · interrupt_type · stale_discarded · places_source · tool_delay — live over WebSocket.",
  },
];

const KEYS = [
  { key: "GROQ_API_KEY", use: "Mic STT (Whisper)" },
  { key: "RIME_API_KEY", use: "Spoken voice (TTS)" },
  { key: "IPINFO_TOKEN", use: "City greeting (optional)" },
  { key: "GEOAPIFY_API_KEY", use: "Map pins / live places (optional)" },
  { key: "USE_LIVE_PLACES", use: "0 = mock demo · 1 = live OSM (no mock fallback)" },
  { key: "VITE_API_URL", use: "frontend/.env.local — must match backend PORT" },
];

export function DemoPage() {
  return (
    <main className="relative mx-auto min-h-screen max-w-[1440px] px-4 py-5 pb-16 sm:px-8 lg:px-12">
      <Backdrop />
      <SiteHeader tagline="60s judge script" />

      <section className="relative z-10 py-12">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-3 text-xs font-semibold tracking-[.22em] text-brand-cyan"
        >
          DEMO DAY · F1
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-4xl font-semibold tracking-[-.04em] sm:text-5xl"
        >
          Judge script <span className="gradient-text">in 60 seconds</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mt-4 max-w-2xl leading-7 text-muted-foreground"
        >
          Default results are <strong className="text-foreground">mock inventory</strong> (~4–5s so
          interrupts are visible). Set <code className="text-foreground">USE_LIVE_PLACES=1</code> for
          live OSM (no mock fallback). Interrupts, stale fencing, Groq STT, Rime TTS, and Wikipedia FACT
          are live. Full notes in <span className="font-mono text-foreground">DEMO.md</span>.
        </motion.p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/"
            className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Open Voice lab
          </Link>
          <Link
            to="/evaluate"
            className="rounded-full border border-border bg-card/60 px-5 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Evaluation harness
          </Link>
        </div>
      </section>

      <section className="relative z-10 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.n}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="glass-card flex gap-4 p-5"
            >
              <span className="font-mono text-sm text-brand-cyan">{step.n}</span>
              <div>
                <h2 className="font-semibold">{step.title}</h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.body}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <aside className="glass-card h-fit p-5">
          <p className="text-xs font-semibold tracking-[.18em] text-brand-amber">API KEYS / ENV</p>
          <ul className="mt-4 space-y-3 text-sm">
            {KEYS.map((row) => (
              <li key={row.key}>
                <code className="text-foreground">{row.key}</code>
                <p className="text-muted-foreground">{row.use}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-muted-foreground">
            Copy <code className="text-foreground">backend/.env.example</code> →{" "}
            <code className="text-foreground">.env</code> ·{" "}
            <code className="text-foreground">frontend/.env.example</code> →{" "}
            <code className="text-foreground">.env.local</code>
          </p>
          <div className="mt-6 rounded-xl border border-border bg-background/50 p-3 font-mono text-[11px] leading-5 text-muted-foreground">
            Actually, only vegetarian… → REFINE
            <br />
            What are you searching for? → STATUS
            <br />
            What is Connaught Place? → FACT
            <br />
            Find restaurants instead → PIVOT
            <br />
            Forget it → CANCEL
          </div>
          <p className="mt-4 text-[11px] leading-5 text-muted-foreground">
            One backend + one Vite. If judge panel says Waiting for WebSocket,{" "}
            <code className="text-foreground">VITE_API_URL</code> does not match the BE port.
          </p>
        </aside>
      </section>
    </main>
  );
}
