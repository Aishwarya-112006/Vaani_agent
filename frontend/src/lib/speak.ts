/**
 * Speak with instant UI-friendly behavior:
 * - starts TTS fetch immediately
 * - if audio isn't playing within ~900ms, plays a tiny speechSynthesis bridge
 *   so there is never >1s of dead air while waiting on Rime
 */

import { fetchRimeSpeech } from "@/lib/api";
import { playRimeAudio, stopAudio, unlockAudio } from "@/lib/audio";
import { voiceBridge } from "@/lib/copy";

export type SpeakHandlers = {
  onStart?: () => void;
  onWaiting?: () => void;
  onPlaying?: () => void;
  onDone?: () => void;
  onError?: (message: string) => void;
};

function speakBrowser(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-IN";
  utterance.rate = 1.05;
  window.speechSynthesis.speak(utterance);
}

export async function speakLine(text: string, handlers: SpeakHandlers = {}): Promise<void> {
  const line = text.trim();
  if (!line) return;

  stopSpeaking();
  handlers.onStart?.();
  await unlockAudio();

  let bridged = false;
  const waitTimer = window.setTimeout(() => {
    bridged = true;
    handlers.onWaiting?.();
    speakBrowser(voiceBridge());
  }, 900);

  try {
    const bytes = await fetchRimeSpeech(line);
    window.clearTimeout(waitTimer);
    if (bridged && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    handlers.onPlaying?.();
    await playRimeAudio(bytes);
    handlers.onDone?.();
  } catch (err) {
    window.clearTimeout(waitTimer);
    handlers.onError?.(err instanceof Error ? err.message : "TTS failed");
    // Always give audible feedback — never silent failure
    speakBrowser(line);
    handlers.onDone?.();
  }
}

export function stopSpeaking(): void {
  stopAudio();
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
