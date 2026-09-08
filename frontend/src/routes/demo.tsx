import { createFileRoute } from "@tanstack/react-router";

import { DemoPage } from "@/components/vaani/DemoPage";

const title = "60s judge script — VaaniAgent";
const description =
  "Demo-day walkthrough: city confirm, refine/status/fact/pivot interrupts, follow-up chips, and API key checklist.";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: DemoPage,
});
