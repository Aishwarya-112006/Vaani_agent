import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import { Backdrop } from "@/components/vaani/backdrop";
import { SiteHeader } from "@/components/vaani/site-header";
import { API_BASE } from "@/lib/api";

export type EvalMetric = {
  value: number;
  display: string;
  target: string;
  pass: boolean;
  n?: number;
  d?: number;
  samples?: number;
};

export type EvalScenario = {
  id: string;
  type: string;
  description: string;
  expected: string;
  result: "PASS" | "FAIL" | string;
  passed: boolean;
  recovery_latency_ms?: number | null;
  error?: string | null;
  checks?: Array<{ check: string; pass: boolean; detail?: string }>;
};

export type EvalResults = {
  generated_at: string;
  harness: string;
  scenario_count: number;
  passed: number;
  failed: number;
  metrics: {
    interrupt_detection: EvalMetric;
    stale_block_rate: EvalMetric;
    context_preservation: EvalMetric;
    recovery_latency_ms: EvalMetric;
    status_non_cancel: EvalMetric;
    scenarios_passed?: EvalMetric;
  };
  scenarios: EvalScenario[];
};

const METRIC_ORDER: Array<{ key: keyof EvalResults["metrics"]; name: string }> = [
  { key: "interrupt_detection", name: "Interrupt detection" },
  { key: "stale_block_rate", name: "Stale block rate" },
  { key: "context_preservation", name: "Context preservation" },
  { key: "recovery_latency_ms", name: "Recovery latency" },
  { key: "status_non_cancel", name: "STATUS non-cancel" },
];

const typeStyles: Record<string, string> = {
  NORMAL: "border-border bg-card text-muted-foreground",
  REFINE: "border-primary/25 bg-primary/10 text-brand-violet",
  CANCEL: "border-destructive/25 bg-destructive/10 text-brand-rose",
  STATUS: "border-accent/25 bg-accent/10 text-brand-cyan",
  PIVOT: "border-brand-amber/25 bg-brand-amber/10 text-brand-amber",
  FACT: "border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan",
  STALE: "border-brand-rose/25 bg-brand-rose/10 text-brand-rose",
  MULTI: "border-brand-lime/25 bg-brand-lime/10 text-brand-lime",
  EDGE: "border-border bg-card text-foreground",
};

type QaRow = {
  scenario_id: string;
  passed?: boolean;
  interrupt_type?: string;
  note?: string;
  latency_ms?: number;
};

async function loadJson<T>(paths: string[]): Promise<T> {
  let lastError: Error | null = null;
  for (const url of paths) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(`${url} → ${response.status}`);
        continue;
      }
      return (await response.json()) as T;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }
  throw lastError ?? new Error("Could not load JSON");
}

async function loadResults(): Promise<EvalResults> {
  const bust = `t=${Date.now()}`;
  return loadJson([`/evaluation/results.json?${bust}`, `${API_BASE}/evaluate/results?${bust}`]);
}

async function loadQaIndependent(): Promise<QaRow[]> {
  const bust = `t=${Date.now()}`;
  return loadJson([
    `/evaluation/qa_independent_results.json?${bust}`,
    `${API_BASE}/evaluate/qa?${bust}`,
  ]);
}

function formatGeneratedAt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function EvalPage() {
  const [data, setData] = useState<EvalResults | null>(null);
  const [qaRows, setQaRows] = useState<QaRow[]>([]);
  const [tab, setTab] = useState<"harness" | "qa">("harness");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([loadResults(), loadQaIndependent().catch(() => [] as QaRow[])])
      .then(([payload, qa]) => {
        if (!cancelled) {
          setData(payload);
          setQaRows(Array.isArray(qa) ? qa : []);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load results");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const passed = data?.passed ?? 0;
  const total = data?.scenario_count ?? 0;
  const qaPassed = qaRows.filter((r) => r.passed).length;
  const factRows = qaRows.filter((r) => (r.interrupt_type || "").toUpperCase() === "FACT");

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
          QA HARNESS · {total || 25} SCENARIOS
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
          Metrics from <span className="font-mono text-foreground">evaluation/results.json</span>
          {data?.generated_at ? <> · generated {formatGeneratedAt(data.generated_at)}</> : null}.
          Independent pytest log:{" "}
          <span className="font-mono text-foreground">qa_independent_results.json</span>
          {factRows.length ? <> · {factRows.length} FACT rows</> : null}.
        </motion.p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => setTab("harness")}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              tab === "harness"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground"
            }`}
          >
            Metrics harness
          </button>
          <button
            type="button"
            onClick={() => setTab("qa")}
            className={`rounded-full px-4 py-2 text-xs font-semibold ${
              tab === "qa"
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground"
            }`}
          >
            QA independent ({qaPassed}/{qaRows.length || 0})
          </button>
        </div>
      </section>

      {loading ? (
        <p className="relative z-10 text-sm text-muted-foreground">Loading results…</p>
      ) : null}

      {error ? (
        <div className="relative z-10 rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-brand-rose">
          <p className="font-semibold">Could not load results.json</p>
          <p className="mt-2 text-muted-foreground">{error}</p>
          <p className="mt-3 text-xs text-muted-foreground">
            Run the harness from the repo root:{" "}
            <span className="font-mono text-foreground">
              backend/.venv/Scripts/python evaluation/compute_metrics.py
            </span>
          </p>
        </div>
      ) : null}

      {data && tab === "harness" ? (
        <>
          <div className="relative z-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {METRIC_ORDER.map(({ key, name }, i) => {
              const metric = data.metrics[key];
              if (!metric) return null;
              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ delay: i * 0.07, duration: 0.45 }}
                  className="glass-card p-4"
                >
                  <p className="text-xs text-muted-foreground">{name}</p>
                  <p
                    className={`mt-3 font-mono text-2xl ${
                      metric.pass ? "text-brand-lime" : "text-brand-rose"
                    }`}
                  >
                    {metric.display}
                  </p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    target {metric.target}
                    {typeof metric.n === "number" && typeof metric.d === "number"
                      ? ` · ${metric.n}/${metric.d}`
                      : ""}
                  </p>
                </motion.div>
              );
            })}
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
                  Loaded from results.json · {data.harness}
                </p>
              </div>
              <span
                className={`rounded-full border px-3 py-1.5 font-mono text-xs ${
                  data.failed === 0
                    ? "border-brand-lime/30 bg-brand-lime/10 text-brand-lime"
                    : "border-brand-rose/30 bg-brand-rose/10 text-brand-rose"
                }`}
              >
                {passed}/{total} passed
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
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
                    <th scope="col" className="py-4 pr-4 font-medium">
                      Recovery
                    </th>
                    <th scope="col" className="px-5 py-4 font-medium">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.scenarios.map((scenario) => (
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
                      <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                        {typeof scenario.recovery_latency_ms === "number"
                          ? `${Math.round(scenario.recovery_latency_ms)} ms`
                          : "—"}
                      </td>
                      <td
                        className={`px-5 py-3 text-xs font-semibold ${
                          scenario.passed ? "text-brand-lime" : "text-brand-rose"
                        }`}
                      >
                        {scenario.result}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>

          <footer className="relative z-10 py-8 text-center text-xs text-muted-foreground">
            Auto-loaded from evaluation/results.json · {passed}/{total} scenarios · refresh after
            re-running compute_metrics
          </footer>
        </>
      ) : null}

      {tab === "qa" ? (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 overflow-hidden rounded-2xl border border-border bg-card/70 backdrop-blur-md"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
            <div>
              <h2 className="font-semibold">QA-independent pytest log</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                evaluation/qa_independent_results.json · includes FACT when present
              </p>
            </div>
            <span className="rounded-full border border-brand-lime/30 bg-brand-lime/10 px-3 py-1.5 font-mono text-xs text-brand-lime">
              {qaPassed}/{qaRows.length} passed
            </span>
          </div>
          {!qaRows.length ? (
            <p className="p-5 text-sm text-muted-foreground">
              No QA file yet — run <code className="text-foreground">pytest tests/ -q</code> then
              refresh.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4 font-medium">ID</th>
                    <th className="py-4 pr-4 font-medium">Interrupt</th>
                    <th className="py-4 pr-4 font-medium">Note</th>
                    <th className="px-5 py-4 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {qaRows.map((row) => (
                    <tr key={row.scenario_id} className="border-b border-border/60 last:border-0">
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                        {row.scenario_id}
                      </td>
                      <td className="py-3 pr-4">
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                            typeStyles[(row.interrupt_type || "EDGE").toUpperCase()] ??
                            typeStyles["EDGE"]
                          }`}
                        >
                          {row.interrupt_type || "—"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{row.note || "—"}</td>
                      <td
                        className={`px-5 py-3 text-xs font-semibold ${
                          row.passed ? "text-brand-lime" : "text-brand-rose"
                        }`}
                      >
                        {row.passed ? "PASS" : "FAIL"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>
      ) : null}
    </main>
  );
}
