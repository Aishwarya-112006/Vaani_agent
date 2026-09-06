/**
 * Cross-browser Rime TTS playback (Chrome, Edge, Firefox, Safari / iOS).
 *
 * Autoplay rules: call `unlockAudio()` inside a user gesture (pointer/key)
 * so later TTS can start without a second click.
 *
 * Strategy:
 * 1. Prefer Web Audio API (shared AudioContext + BufferSource)
 * 2. Fall back to HTMLAudioElement + blob URL when decode fails (Safari MP3 quirks)
 */

type AudioContextConstructor = typeof AudioContext;

let sharedCtx: AudioContext | null = null;
let unlocked = false;
let currentSource: AudioBufferSourceNode | null = null;
let currentHtmlAudio: HTMLAudioElement | null = null;
let currentObjectUrl: string | null = null;

function AudioContextCtor(): AudioContextConstructor {
  if (typeof window === "undefined") {
    throw new Error("Web Audio is only available in the browser");
  }
  const Ctx =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio API is not supported in this browser");
  return Ctx;
}

function getContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new (AudioContextCtor())();
  }
  return sharedCtx;
}

/** Safari / older WebKit: start() may be missing — use noteOn. */
function startSource(source: AudioBufferSourceNode, when = 0): void {
  const legacy = source as AudioBufferSourceNode & { noteOn?: (when?: number) => void };
  if (typeof source.start === "function") {
    source.start(when);
  } else if (typeof legacy.noteOn === "function") {
    legacy.noteOn(when);
  } else {
    throw new Error("AudioBufferSourceNode.start is not available");
  }
}

function stopSource(source: AudioBufferSourceNode): void {
  const legacy = source as AudioBufferSourceNode & { noteOff?: (when?: number) => void };
  try {
    if (typeof source.stop === "function") source.stop();
    else if (typeof legacy.noteOff === "function") legacy.noteOff(0);
  } catch {
    /* already stopped */
  }
}

/**
 * Promise-safe decodeAudioData.
 * Safari historically preferred the callback signature; some builds reject the Promise form.
 */
function decodeAudioDataCompat(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const ok = (buffer: AudioBuffer) => {
      if (settled) return;
      settled = true;
      resolve(buffer);
    };
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err instanceof Error ? err : new Error("decodeAudioData failed"));
    };

    try {
      const result = ctx.decodeAudioData(data, ok, fail);
      // Spec: may also return a Promise — settle either path once
      if (result && typeof (result as Promise<AudioBuffer>).then === "function") {
        (result as Promise<AudioBuffer>).then(ok, fail);
      }
    } catch (err) {
      fail(err);
    }
  });
}

async function decodeBytes(ctx: AudioContext, bytes: ArrayBuffer): Promise<AudioBuffer> {
  // decodeAudioData detaches the buffer in some engines — always copy
  try {
    return await decodeAudioDataCompat(ctx, bytes.slice(0));
  } catch {
    // Second attempt with a fresh copy (Safari MP3 path differences)
    return decodeAudioDataCompat(ctx, bytes.slice(0));
  }
}

/** Play a near-silent buffer so Safari marks the context as user-activated. */
function playSilentUnlockTick(ctx: AudioContext): void {
  try {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    startSource(source, 0);
  } catch {
    /* best-effort unlock */
  }
}

let htmlUnlocked = false;

/** Prime HTMLAudioElement autoplay during the same gesture (Safari/Firefox). */
function unlockHtmlAudio(): void {
  if (htmlUnlocked || typeof window === "undefined") return;
  try {
    // Tiny silent WAV (44-byte header + 1 sample of silence)
    const silent =
      "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
    const a = new Audio(silent);
    a.volume = 0.01;
    (a as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
    const p = a.play();
    if (p && typeof p.then === "function") {
      void p
        .then(() => {
          a.pause();
          htmlUnlocked = true;
        })
        .catch(() => {
          /* will retry on next gesture */
        });
    } else {
      htmlUnlocked = true;
    }
  } catch {
    /* ignore */
  }
}

/**
 * Resume / unlock AudioContext from a trusted user gesture.
 * Safe to call repeatedly from hold-to-talk, send, Enter, Space.
 */
export async function unlockAudio(): Promise<void> {
  if (typeof window === "undefined") return;

  const ctx = getContext();

  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      /* gesture may still unlock on next start() */
    }
  }

  if (!unlocked) {
    playSilentUnlockTick(ctx);
    unlocked = true;
  }

  unlockHtmlAudio();

  // Keep context alive when tab becomes visible again (mobile Safari)
  if (typeof document !== "undefined" && !(document as Document & { __vaaniAudioVis?: boolean }).__vaaniAudioVis) {
    (document as Document & { __vaaniAudioVis?: boolean }).__vaaniAudioVis = true;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && sharedCtx?.state === "suspended") {
        void sharedCtx.resume();
      }
    });
  }
}

export function stopAudio(): void {
  if (currentSource) {
    stopSource(currentSource);
    currentSource = null;
  }
  if (currentHtmlAudio) {
    try {
      currentHtmlAudio.pause();
      currentHtmlAudio.removeAttribute("src");
      currentHtmlAudio.load();
    } catch {
      /* ignore */
    }
    currentHtmlAudio = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function sniffMime(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  // ID3 or MPEG frame sync → mp3
  if (u8.length >= 3 && u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) return "audio/mpeg";
  if (u8.length >= 2 && u8[0] === 0xff && (u8[1] & 0xe0) === 0xe0) return "audio/mpeg";
  // RIFF WAVE
  if (
    u8.length >= 12 &&
    u8[0] === 0x52 &&
    u8[1] === 0x49 &&
    u8[2] === 0x46 &&
    u8[3] === 0x46
  ) {
    return "audio/wav";
  }
  // ftyp → m4a/aac
  if (u8.length >= 8 && u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) {
    return "audio/mp4";
  }
  return "audio/mpeg";
}

/** HTMLAudioElement path — reliable for Safari when Web Audio MP3 decode fails. */
function playViaHtmlAudio(bytes: ArrayBuffer): Promise<void> {
  stopAudio();

  const mime = sniffMime(bytes);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  currentObjectUrl = url;

  const audio = new Audio();
  audio.preload = "auto";
  audio.src = url;
  // iOS sometimes needs playsInline
  (audio as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  currentHtmlAudio = audio;

  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      if (currentHtmlAudio === audio) currentHtmlAudio = null;
      if (currentObjectUrl === url) {
        URL.revokeObjectURL(url);
        currentObjectUrl = null;
      }
    };

    audio.onended = () => {
      cleanup();
      resolve();
    };
    audio.onerror = () => {
      cleanup();
      reject(new Error("HTMLAudioElement failed to play TTS"));
    };

    const playResult = audio.play();
    if (playResult && typeof playResult.then === "function") {
      playResult.catch((err) => {
        cleanup();
        reject(err instanceof Error ? err : new Error("audio.play() rejected"));
      });
    }
  });
}

async function playViaWebAudio(bytes: ArrayBuffer): Promise<void> {
  const ctx = getContext();
  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  const audioBuffer = await decodeBytes(ctx, bytes);

  stopAudio();

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  currentSource = source;

  await new Promise<void>((resolve, reject) => {
    source.onended = () => {
      if (currentSource === source) currentSource = null;
      resolve();
    };
    try {
      startSource(source, 0);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Failed to start audio"));
    }
  });
}

/**
 * Decode and play Rime audio bytes.
 * Tries Web Audio first, then HTMLAudioElement for Safari/Firefox edge cases.
 */
export async function playRimeAudio(bytes: ArrayBuffer): Promise<void> {
  if (!bytes || bytes.byteLength === 0) {
    throw new Error("Empty audio payload");
  }

  await unlockAudio();

  try {
    await playViaWebAudio(bytes);
  } catch {
    await playViaHtmlAudio(bytes);
  }
}
