/**
 * Interrupt classification — keep in sync with backend `api.main._classify_interrupt`
 * and `_hotel_signal` / `_restaurant_signal` (H2 / C1).
 *
 * Backend is source of truth on the audio path (prefer `interrupt_type` from API).
 * This client classifier is for typed submit + optimistic UI before/without WS.
 */

export type InterruptKind = "REFINE" | "CANCEL" | "STATUS" | "PIVOT" | "FACT";

export type ClassifyTask = {
  type: "hotel" | "restaurant";
} | null;

const STATUS_RE = /what are you|are you still|how long|status/;
const FACT_RE = /\b(what is|tell me about|who is|kya hai|kya hota)\b|\bbatao\b/;
const CANCEL_RE = /forget it|never mind|stop searching|cancel|stop it/;
const RESTAURANT_RE = /restaurant|food|eat|dinner|cafe|cuisine|thali|lunch|breakfast/;
const HOTEL_RE = /\bhotels?\b|\bstay\b|\broom\b|\brooms?\b|lodging|accommodation|resort/;
const REFINE_RE = /actually|only|vegetarian|veg|under|metro|near|rupees|₹|cuisine|area|same\s+(but|search)/;

/** Mirror of backend `_classify_interrupt` (same keyword families). */
export function classifyInterrupt(text: string, task: ClassifyTask): InterruptKind | null {
  const s = text.toLowerCase();
  if (STATUS_RE.test(s)) return "STATUS";
  if (FACT_RE.test(s)) return "FACT";
  if (CANCEL_RE.test(s)) return "CANCEL";
  if (
    task &&
    ((task.type === "hotel" && RESTAURANT_RE.test(s)) ||
      (task.type === "restaurant" && HOTEL_RE.test(s)))
  ) {
    return "PIVOT";
  }
  if (task && REFINE_RE.test(s)) return "REFINE";
  return null;
}
