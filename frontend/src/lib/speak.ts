/**
 * Speak via Rime only (one voice).
 * Browser speechSynthesis is used ONLY if Rime fails — never as a "bridge",
 * so you don't hear a system voice then Luna a second later.
 */

import { fetchRimeSpeech } from "@/lib/api";
import { playRimeAudio, stopAudio, unlockAudio } from "@/lib/audio";
import type { ReplyLang } from "@/lib/copy";

export type SpeakHandlers = {
  onStart?: () => void;
  onWaiting?: () => void;
  onPlaying?: () => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

let speakGeneration = 0;

function haltPlayback(): void {
  stopAudio();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

function speakBrowser(text: string, lang: ReplyLang = "en"): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang === "hi" ? "hi-IN" : "en-IN";
  utterance.rate = 1.08;
  window.speechSynthesis.speak(utterance);
}

export async function speakLine(
  text: string,
  handlers: SpeakHandlers = {},
  replyLang: ReplyLang = "en",
): Promise<void> {
  const line = text.trim();
  if (!line) return;

  const gen = ++speakGeneration;
  haltPlayback();
  handlers.onStart?.();
  await unlockAudio();
  if (gen !== speakGeneration) return;

  // UI-only waiting hint — do NOT speak with the browser (different voice from Rime)
  const waitTimer = window.setTimeout(() => {
    if (gen !== speakGeneration) return;
    handlers.onWaiting?.();
  }, 450);

  try {
    const bytes = await fetchRimeSpeech(line, replyLang);
    window.clearTimeout(waitTimer);
    if (gen !== speakGeneration) return;
    handlers.onPlaying?.();
    await playRimeAudio(bytes);
    if (gen !== speakGeneration) return;
    handlers.onDone?.();
  } catch (err) {
    window.clearTimeout(waitTimer);
    if (gen !== speakGeneration) return;
    handlers.onError?.(err instanceof Error ? err.message : "TTS failed");
    // Last resort only — same message, system voice
    speakBrowser(line, replyLang);
    handlers.onDone?.();
  }
}

/** Cancel any in-flight / playing speech (bumps generation so late TTS is ignored). */
export function stopSpeaking(): void {
  speakGeneration += 1;
  haltPlayback();
}
