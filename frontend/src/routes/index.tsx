import { createFileRoute } from "@tanstack/react-router";

import { VoiceAgent } from "@/components/vaani/voice-agent";

const title = "VaaniAgent — A voice agent that stays correct when you change your mind";
const description =
  "India-first voice booking agent with interrupt classification, stale-result fencing and a live judge debug panel.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: VoiceAgent,
});
