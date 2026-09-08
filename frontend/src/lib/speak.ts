/**
 * Speak via Rime only (one voice).
 * No browser speechSynthesis bridge — keeps ack → result the same voice.
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
  // Keep AudioContext unlocked across barge-in
  await unlockAudio();
  if (gen !== speakGeneration) return;

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
    // No browser bridge — same Rime voice only; show text / errTts in UI
    handlers.onDone?.();
  }
}

/** Cancel any in-flight / playing speech (bumps generation so late TTS is ignored). */
export function stopSpeaking(): void {
  speakGeneration += 1;
  haltPlayback();
}
