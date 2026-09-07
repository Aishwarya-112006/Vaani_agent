/**
 * Client-side reply-language detect (mirrors backend/agent/language.py).
 * Used so typed messages get the right ack/TTS before /message returns.
 */

import type { ReplyLang } from "@/lib/copy";

const DEVANAGARI = /[\u0900-\u097F]/;
const HI_MARKERS =
  /\b(hai|hain|hoon|hun|kya|kyu|kyun|kaise|kaisa|kaisi|chahiye|chahie|bolo|batao|bataiye|dikhao|mujhe|mera|meri|mere|aap|tum|hum|nahi|nahin|mat|abhi|phir|thoda|bahut|dhundo|dhoondho|dhoondh|milao|sasta|mehenga|ke\s+paas|ke\s+under)\b/i;
const EN_MARKERS = /\b(find|search|hotel|restaurant|under|near|please|actually|want)\b/i;

export function detectReplyLang(text: string, previous: ReplyLang = "en"): ReplyLang {
  const s = text.trim();
  if (!s) return previous;
  if (DEVANAGARI.test(s) || HI_MARKERS.test(s)) return "hi";
  if (EN_MARKERS.test(s)) return "en";
  return previous;
}
