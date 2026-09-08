import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Backdrop } from "@/components/vaani/backdrop";
import { SiteHeader } from "@/components/vaani/site-header";

const STEPS = [
  {
    n: "01",
    title: "Confirm city",
    body: "Yes on the greeting — or Change city. Preferred city is set only after confirm.",
  },
  {
    n: "02",
    title: "Start a search",
    body: "Find hotels in Delhi under ₹5000 — confirm line, then honest searching pulse after ack TTS.",
  },
  {
    n: "03",
    title: "Interrupt mid-flight",
    body: "Actually, only vegetarian and near a metro → REFINE. Or tap Demo · REFINE / STATUS / FACT / PIVOT.",
  },
  {
    n: "04",
    title: "After COMPLETE",
    body: "Cheaper? · Metro? · Veg? · Restaurants? · Book first? — one-tap refine / pivot / mock book.",
  },
  {
    n: "05",
    title: "Show the judge panel",
    body: "turn_id · tool_status · interrupt_type · stale_discarded — live over WebSocket.",
  },
];

const KEYS = [
  { key: "GROQ_API_KEY", use: "Mic STT (Whisper)" },
  { key: "RIME_API_KEY", use: "Spoken voice (TTS)" },
  { key: "IPINFO_TOKEN", use: "City greeting (optional)" },
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
          Hotel and restaurant rows are <strong className="text-foreground">mock inventory</strong>.
          Interrupts, stale fencing, Groq STT, Rime TTS, and Wikipedia FACT are live. Full notes in{" "}
          <span className="font-mono text-foreground">DEMO.md</span>.
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
          <p className="text-xs font-semibold tracking-[.18em] text-brand-amber">API KEYS</p>
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
            <code className="text-foreground">.env</code>
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
        </aside>
      </section>
    </main>
  );
}
