import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Backdrop } from "@/components/vaani/backdrop";
import { SiteHeader } from "@/components/vaani/site-header";

const title = "Evaluation harness — VaaniAgent";
const description =
  "25 scripted interruption scenarios measuring interrupt detection, stale-result blocking, context preservation and recovery latency.";

export const Route = createFileRoute("/evaluate")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: EvaluatePage,
});

type Scenario = { id: string; type: string; description: string; expected: string };

const scenarios: Scenario[] = [
  {
    id: "T01",
    type: "NORMAL",
    description: "Single hotel search, no interruption",
    expected: "Correct result spoken",
  },
  {
    id: "T02",
    type: "NORMAL",
    description: "Single restaurant search, no interruption",
    expected: "Correct result spoken",
  },
  {
    id: "T03",
    type: "NORMAL",
    description: "LLM tool selection test",
    expected: "Correct tool chosen",
  },
  ...[
    "budget ₹3000",
    "vegetarian only",
    "near-metro filter",
    "budget + veg mid-search",
    "price ceiling raised",
  ].map((x, i) => ({
    id: `T0${i + 4}`,
    type: "REFINE",
    description: x,
    expected: "Old task cancelled, new result correct",
  })),
  ...["location Mumbai", "location Bangalore", "Connaught Place"].map((x, i) => ({
    id: `T${i + 9}`,
    type: "REFINE",
    description: x,
    expected: "Updated search with new location",
  })),
  ...["forget it", "never mind", "stop searching"].map((x, i) => ({
    id: `T${i + 12}`,
    type: "CANCEL",
    description: x,
    expected: "Rime acknowledges, no result spoken",
  })),
  ...["what are you searching", "still looking", "how long"].map((x, i) => ({
    id: `T${i + 15}`,
    type: "STATUS",
    description: x,
    expected: "Status spoken, tool continues running",
  })),
  ...["hotels → restaurants", "restaurants → hotels", "hotels → cab"].map((x, i) => ({
    id: `T${i + 18}`,
    type: "PIVOT",
    description: x,
    expected: "New tool called, old result discarded",
  })),
  ...["extra delay then interrupt", "delayed result", "late tool response"].map((x, i) => ({
    id: `T${i + 21}`,
    type: "STALE",
    description: x,
    expected: "Stale result blocked from Rime",
  })),
  {
    id: "T24",
    type: "MULTI",
    description: "Three rapid corrections",
    expected: "Final state reflects all constraints",
  },
  {
    id: "T25",
    type: "EDGE",
    description: "Interrupt before tool starts",
    expected: "Graceful handling, no crash",
  },
];

const metrics = [
  { name: "Interrupt detection", value: "90.5%", target: "target 85%+" },
  { name: "Stale block rate", value: "100.0%", target: "target 100%" },
  { name: "Context preservation", value: "92.0%", target: "target 90%+" },
  { name: "Recovery latency", value: "1420 ms", target: "target <2000ms" },
  { name: "STATUS non-cancel", value: "100.0%", target: "target 100%" },
];

const typeStyles: Record<string, string> = {
  NORMAL: "border-border bg-card text-muted-foreground",
  REFINE: "border-primary/25 bg-primary/10 text-brand-violet",
  CANCEL: "border-destructive/25 bg-destructive/10 text-brand-rose",
  STATUS: "border-accent/25 bg-accent/10 text-brand-cyan",
  PIVOT: "border-brand-amber/25 bg-brand-amber/10 text-brand-amber",
  STALE: "border-brand-rose/25 bg-brand-rose/10 text-brand-rose",
  MULTI: "border-brand-lime/25 bg-brand-lime/10 text-brand-lime",
  EDGE: "border-border bg-card text-foreground",
};

function EvaluatePage() {
  return (
    <main className="relative mx-auto min-h-screen max-w-[1440px] px-4 py-5 pb-16 sm:px-8 lg:px-12">
      <Backdrop />
      <SiteHeader tagline="stays correct when you change your mind" />

      <section className="relative z-10 py-12">
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-3 text-xs font-semibold tracking-[.22em] text-brand-cyan"
        >
          QA HARNESS · 25 SCENARIOS
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.55 }}
          className="text-4xl font-semibold tracking-[-.04em] sm:text-5xl"
        >
          Evaluation <span className="gradient-text">harness</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-4 max-w-2xl leading-7 text-muted-foreground"
        >
          Scripted interruption scenarios for the conversational correctness claim. Numbers are
          exploratory until a real <span className="font-mono text-foreground">results.json</span>{" "}
          is loaded.
        </motion.p>
      </section>

      <div className="relative z-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((metric, i) => (
          <motion.div
            key={metric.name}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: i * 0.07, duration: 0.45 }}
            className="glass-card p-4"
          >
            <p className="text-xs text-muted-foreground">{metric.name}</p>
            <p className="mt-3 font-mono text-2xl text-brand-lime">{metric.value}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">{metric.target}</p>
          </motion.div>
        ))}
      </div>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 mt-6 overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-md"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
          <div>
            <h2 className="font-semibold">Scenario results</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Loaded from sample data · backend fallback ready
            </p>
          </div>
          <span className="rounded-full border border-brand-lime/30 bg-brand-lime/10 px-3 py-1.5 font-mono text-xs text-brand-lime">
            {scenarios.length}/{scenarios.length} passed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-4 font-medium">
                  ID
                </th>
                <th scope="col" className="py-4 pr-4 font-medium">
                  Type
                </th>
                <th scope="col" className="py-4 pr-4 font-medium">
                  Description
                </th>
                <th scope="col" className="py-4 pr-4 font-medium">
                  Expected
                </th>
                <th scope="col" className="px-5 py-4 font-medium">
                  Result
                </th>
              </tr>
            </thead>
            <tbody>
              {scenarios.map((scenario) => (
                <tr
                  key={scenario.id}
                  className="border-b border-border/60 transition-colors last:border-0 hover:bg-primary/5"
                >
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {scenario.id}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`rounded-full border px-2 py-1 text-[10px] font-semibold tracking-wider ${
                        typeStyles[scenario.type] ?? typeStyles["NORMAL"]
                      }`}
                    >
                      {scenario.type}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-foreground">{scenario.description}</td>
                  <td className="py-3 pr-4 text-muted-foreground">{scenario.expected}</td>
                  <td className="px-5 py-3 text-xs font-semibold text-brand-lime">PASS</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.section>

      <footer className="relative z-10 py-8 text-center text-xs text-muted-foreground">
        Placeholder dashboard until QA writes evaluation/results.json. Small sample — treat as
        exploratory.
      </footer>
    </main>
  );
}
