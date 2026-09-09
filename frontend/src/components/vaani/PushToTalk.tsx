import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Mic, Square, WandSparkles } from "lucide-react";

import { sendAudioMessage, type MessageResponse } from "@/lib/api";
import { unlockAudio } from "@/lib/audio";
import { errShortClip, errSttBusy, errSttFailed } from "@/lib/copy";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

const MIN_MS = 800;
const MAX_MS = 8000;
const MIN_BLOB_BYTES = 400;

function pickMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export type PushToTalkSent = MessageResponse & { bytes: number };

type PushToTalkProps = {
  sessionId: string;
  disabled?: boolean;
  onRecordingChange?: (recording: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  onSent?: (result: PushToTalkSent) => void;
  onError?: (message: string) => void;
  /** Called when mic starts — parent should stopSpeaking() for barge-in */
  onBargeIn?: () => void;
};

/**
 * Click-to-toggle mic:
 * 1st click → start recording
 * 2nd click → stop & send (after at least ~0.8s)
 * Auto-stops at 8s.
 *
 * Each recording gets a session id so a late MediaRecorder.onstop cannot
 * stop a newer mic stream or send the wrong/empty blob.
 */
export function PushToTalk({
  sessionId,
  disabled = false,
  onRecordingChange,
  onBusyChange,
  onSent,
  onError,
  onBargeIn,
}: PushToTalkProps) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [arming, setArming] = useState(false);

  const recordingRef = useRef(false);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const busyRef = useRef(false);
  const disabledRef = useRef(disabled);
  const armingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const maxTimerRef = useRef<number | null>(null);
  const minTimerRef = useRef<number | null>(null);
  const recSessionRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  const onRecordingChangeRef = useRef(onRecordingChange);
  const onBusyChangeRef = useRef(onBusyChange);
  const onSentRef = useRef(onSent);
  const onErrorRef = useRef(onError);
  const onBargeInRef = useRef(onBargeIn);

  sessionIdRef.current = sessionId;
  disabledRef.current = disabled;
  onRecordingChangeRef.current = onRecordingChange;
  onBusyChangeRef.current = onBusyChange;
  onSentRef.current = onSent;
  onErrorRef.current = onError;
  onBargeInRef.current = onBargeIn;

  const setIsRecording = useCallback((next: boolean) => {
    recordingRef.current = next;
    setRecording(next);
    onRecordingChangeRef.current?.(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (maxTimerRef.current != null) {
      window.clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (minTimerRef.current != null) {
      window.clearTimeout(minTimerRef.current);
      minTimerRef.current = null;
    }
  }, []);

  const flushAndSend = useCallback(async (parts: BlobPart[], mimeType: string) => {
    const blob = new Blob(parts, { type: mimeType || "audio/webm" });

    if (blob.size < MIN_BLOB_BYTES) {
      onErrorRef.current?.(errShortClip());
      return;
    }

    busyRef.current = true;
    setBusy(true);
    onBusyChangeRef.current?.(true);
    try {
      const result = await sendAudioMessage(sessionIdRef.current, blob);
      onSentRef.current?.({ ...result, bytes: blob.size });
    } catch (error) {
      const raw = error instanceof Error ? error.message : "Failed to send audio to /message";
      const status = (error as Error & { status?: number })?.status;
      if (status === 429 || /busy|rate.?limit/i.test(raw)) {
        onErrorRef.current?.(errSttBusy());
      } else if (
        status === 502 ||
        status === 503 ||
        /speech-to-text|stt|access denied|403|transcription|whisper|groq/i.test(raw)
      ) {
        onErrorRef.current?.(errSttFailed());
      } else {
        onErrorRef.current?.(raw);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      onBusyChangeRef.current?.(false);
    }
  }, []);

  const stopRecording = useCallback(
    (opts?: { force?: boolean }) => {
      if (stoppingRef.current) return;
      if (!recordingRef.current && !recorderRef.current) return;

      const held = Date.now() - startedAtRef.current;
      if (!opts?.force && held < MIN_MS) {
        clearTimers();
        minTimerRef.current = window.setTimeout(
          () => stopRecording({ force: true }),
          MIN_MS - held,
        );
        return;
      }

      clearTimers();
      const recorder = recorderRef.current;
      stoppingRef.current = true;
      setIsRecording(false);

      if (!recorder) {
        stoppingRef.current = false;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        return;
      }

      try {
        if (recorder.state === "recording") {
          recorder.requestData();
          recorder.stop();
        } else if (recorder.state !== "inactive") {
          recorder.stop();
        } else {
          // Already inactive — onstop may not fire; finalize here only if still current
          stoppingRef.current = false;
        }
      } catch {
        stoppingRef.current = false;
      }
      recorderRef.current = null;
    },
    [clearTimers, setIsRecording],
  );

  const startRecording = useCallback(async () => {
    if (
      disabledRef.current ||
      busyRef.current ||
      recordingRef.current ||
      startingRef.current ||
      stoppingRef.current
    ) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onErrorRef.current?.("Microphone access is not available in this browser.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      onErrorRef.current?.("MediaRecorder is not supported in this browser.");
      return;
    }

    startingRef.current = true;
    armingRef.current = true;
    setArming(true);

    const recSession = ++recSessionRef.current;
    const localChunks: BlobPart[] = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      });

      // Aborted / superseded while permission dialog was open
      if (!startingRef.current || recSession !== recSessionRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (recSession !== recSessionRef.current) return;
        if (event.data?.size > 0) localChunks.push(event.data);
      };
      recorder.onerror = () => {
        if (recSession !== recSessionRef.current) return;
        onErrorRef.current?.("Microphone recording failed. Try again.");
        clearTimers();
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;
        setIsRecording(false);
        armingRef.current = false;
        setArming(false);
        startingRef.current = false;
        stoppingRef.current = false;
        recorderRef.current = null;
      };
      recorder.onstop = () => {
        // Always stop THIS session's tracks (never touch a newer stream)
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) streamRef.current = null;

        const shouldSend = recSession === recSessionRef.current;
        stoppingRef.current = false;

        if (!shouldSend) return;
        void flushAndSend(localChunks, recorder.mimeType || mimeType || "audio/webm");
      };

      recorderRef.current = recorder;
      recorder.start(250);
      startedAtRef.current = Date.now();
      startingRef.current = false;
      armingRef.current = false;
      setArming(false);
      setIsRecording(true);

      clearTimers();
      maxTimerRef.current = window.setTimeout(() => stopRecording({ force: true }), MAX_MS);
    } catch (error) {
      startingRef.current = false;
      armingRef.current = false;
      setArming(false);
      stoppingRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      const msg = error instanceof Error ? error.message : "Could not start the microphone.";
      if (/NotAllowedError|Permission denied/i.test(msg)) {
        onErrorRef.current?.(
          "Mic permission blocked. Browser settings mein microphone allow karo.",
        );
      } else {
        onErrorRef.current?.(msg);
      }
    }
  }, [clearTimers, flushAndSend, setIsRecording, stopRecording]);

  const toggle = useCallback(() => {
    void unlockAudio();
    if (
      busyRef.current ||
      disabledRef.current ||
      armingRef.current ||
      startingRef.current ||
      stoppingRef.current
    ) {
      return;
    }
    if (recordingRef.current) {
      stopRecording();
    } else {
      // Barge-in: stop TTS but keep AudioContext unlocked
      onBargeInRef.current?.();
      void startRecording();
    }
  }, [startRecording, stopRecording]);

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  // Space toggles once per keydown. Cleanup only on unmount — never mid-recording.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (document.activeElement?.tagName === "INPUT") return;
      event.preventDefault();
      toggleRef.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearTimers();
      startingRef.current = false;
      recSessionRef.current += 1; // invalidate any in-flight onstop send
      if (recordingRef.current || recorderRef.current) {
        stopRecording({ force: true });
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // Intentionally mount-once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hint = busy
    ? "Audio bhej rahi hoon… STT chal raha hai"
    : arming
      ? "Mic start ho raha hai…"
      : recording
        ? "Recording… phir se click / Space to send"
        : "Click mic (or Space) to talk — phir click to send";

  return (
    <div className="flex flex-col items-center">
      <div className="relative grid place-items-center">
        {recording && (
          <span className="pulse-ring absolute size-14 rounded-full bg-destructive/30 sm:size-16" />
        )}
        <motion.button
          type="button"
          aria-label={recording ? "Stop and send" : "Start talking"}
          aria-pressed={recording}
          disabled={disabled || busy || arming}
          onClick={(event) => {
            event.preventDefault();
            toggle();
          }}
          onContextMenu={(event) => event.preventDefault()}
          animate={{ scale: recording ? [1, 1.06, 1] : [1, 1.03, 1] }}
          transition={{
            repeat: Infinity,
            duration: recording ? 0.7 : 2.4,
            ease: "easeInOut",
          }}
          whileTap={{ scale: 0.94 }}
          className={`relative grid size-14 place-items-center rounded-full border-4 text-sm font-semibold text-primary-foreground select-none touch-none sm:size-16 ${
            recording
              ? "border-destructive/30 bg-destructive shadow-[0_0_40px_oklch(0.65_0.22_12/0.55)]"
              : "border-primary/20 bg-gradient-to-br from-primary to-accent shadow-[0_0_40px_oklch(0.53_0.24_294/0.45)]"
          } disabled:opacity-50`}
        >
          {recording ? (
            <Square className="size-5 fill-current" />
          ) : arming ? (
            <Mic className="size-5 animate-pulse" />
          ) : (
            <WandSparkles className="size-5" />
          )}
        </motion.button>
      </div>
      <p className="mt-1.5 max-w-xs text-center text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}
