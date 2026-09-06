import { createFileRoute } from "@tanstack/react-router";

import { EvalPage } from "@/components/vaani/EvalPage";

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
  component: EvalPage,
});
