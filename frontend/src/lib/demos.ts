/**
 * One-click judge demos — each script is a sequence of utterances
 * that exercise REFINE / STATUS / FACT / PIVOT against the live agent.
 */

export type DemoStep = {
  /** Delay before this utterance (ms), after the previous step starts */
  delayMs: number;
  utterance: string;
  expect?: "REFINE" | "STATUS" | "FACT" | "PIVOT" | "SEARCH";
};

export type JudgeDemo = {
  id: "REFINE" | "STATUS" | "FACT" | "PIVOT";
  label: string;
  description: string;
  steps: DemoStep[];
};

export const JUDGE_DEMOS: JudgeDemo[] = [
  {
    id: "REFINE",
    label: "REFINE",
    description: "Start hotels, then tighten filters mid-flight.",
    steps: [
      { delayMs: 0, utterance: "Find hotels in Delhi under ₹5000", expect: "SEARCH" },
      { delayMs: 900, utterance: "Actually, only vegetarian and near a metro", expect: "REFINE" },
    ],
  },
  {
    id: "STATUS",
    label: "STATUS",
    description: "Ask progress while search keeps running.",
    steps: [
      { delayMs: 0, utterance: "Find hotels in Delhi under ₹5000", expect: "SEARCH" },
      { delayMs: 700, utterance: "What are you searching for?", expect: "STATUS" },
    ],
  },
  {
    id: "FACT",
    label: "FACT",
    description: "Wikipedia aside without cancelling the tool.",
    steps: [
      { delayMs: 0, utterance: "Find restaurants in Connaught Place", expect: "SEARCH" },
      { delayMs: 700, utterance: "What is Connaught Place?", expect: "FACT" },
    ],
  },
  {
    id: "PIVOT",
    label: "PIVOT",
    description: "Switch domain and fence the previous search.",
    steps: [
      { delayMs: 0, utterance: "Find hotels in Delhi under ₹5000", expect: "SEARCH" },
      { delayMs: 900, utterance: "Find restaurants there instead", expect: "PIVOT" },
    ],
  },
];
