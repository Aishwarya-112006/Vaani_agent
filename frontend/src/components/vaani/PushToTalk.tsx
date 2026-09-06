import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { motion } from "framer-motion";
import { Mic, WandSparkles } from "lucide-react";

import { sendAudioMessage, type MessageResponse } from "@/lib/api";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

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
};

export function PushToTalk({
  sessionId,
  disabled = false,
  onRecordingChange,
  onBusyChange,
  onSent,
  onError,
}: PushToTalkProps) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);

  const recordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const setIsRecording = useCallback(
    (next: boolean) => {
      recordingRef.current = next;
      setRecording(next);
      onRecordingChange?.(next);
    },
    [onRecordingChange],
  );

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const flushAndSend = useCallback(
    async (mimeType: string) => {
      const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
      chunksRef.current = [];

      if (blob.size < 256) {
        onError?.("Recording was too short. Hold the button and speak, then release.");
        return;
      }

      setBusy(true);
      onBusyChange?.(true);
      try {
        const result = await sendAudioMessage(sessionId, blob);
        onSent?.({ ...result, bytes: blob.size });
      } catch (error) {
        onError?.(error instanceof Error ? error.message : "Failed to send audio to /message");
      } finally {
        setBusy(false);
        onBusyChange?.(false);
      }
    },
    [onBusyChange, onError, onSent, sessionId],
  );

  const startRecording = useCallback(async () => {
    if (disabled || busy || recordingRef.current) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError?.("Microphone access is not available in this browser.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      onError?.("MediaRecorder is not supported in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        void flushAndSend(recorder.mimeType);
      };

      recorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (error) {
      cleanupStream();
      onError?.(error instanceof Error ? error.message : "Could not start the microphone.");
    }
  }, [busy, cleanupStream, disabled, flushAndSend, onError, setIsRecording]);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    setIsRecording(false);

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    recorderRef.current = null;
    cleanupStream();
  }, [cleanupStream, setIsRecording]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat) return;
      if (document.activeElement?.tagName === "INPUT") return;
      event.preventDefault();
      void startRecording();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      event.preventDefault();
      stopRecording();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      stopRecording();
    };
  }, [startRecording, stopRecording]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    void startRecording();
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stopRecording();
  };

  const hint = busy
    ? "Sending audio to /message…"
    : recording
      ? "Recording… release to send"
      : "Hold the button or press spacebar";

  return (
    <div className="flex flex-col items-center">
      <div className="relative grid place-items-center">
        {recording && (
          <span className="pulse-ring absolute size-28 rounded-full bg-destructive/30" />
        )}
        <motion.button
          type="button"
          aria-label="Hold to talk"
          aria-pressed={recording}
          disabled={disabled || busy}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={stopRecording}
          onContextMenu={(event) => event.preventDefault()}
          animate={{ scale: recording ? [1, 1.06, 1] : [1, 1.03, 1] }}
          transition={{
            repeat: Infinity,
            duration: recording ? 0.7 : 2.4,
            ease: "easeInOut",
          }}
          whileTap={{ scale: 0.94 }}
          className={`relative grid size-28 place-items-center rounded-full border-8 text-sm font-semibold text-primary-foreground select-none touch-none ${
            recording
              ? "border-destructive/30 bg-destructive shadow-[0_0_70px_oklch(0.65_0.22_12/0.55)]"
              : "border-primary/20 bg-gradient-to-br from-primary to-accent shadow-[0_0_70px_oklch(0.53_0.24_294/0.45)]"
          } disabled:opacity-50`}
        >
          {recording ? <Mic className="size-6" /> : <WandSparkles className="size-6" />}
        </motion.button>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
