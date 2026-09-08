export const API_BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:8000";

export type SessionResponse = {
  session_id: string;
  detected_city?: string;
  greeting?: string;
  city_source?: string;
  is_local?: boolean;
};

export type MessageResponse = {
  status: string;
  turn_id?: number | null;
  interrupt_type?: string | null;
  active_request_id?: string | null;
  transcript?: string | null;
  reply_lang?: string | null;
  fact_summary?: string | null;
};

export async function createSession(): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE}/session`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to create session (${response.status})`);
  }
  return (await response.json()) as SessionResponse;
}

export async function setSessionCity(
  sessionId: string,
  city: string,
): Promise<{ session_id: string; preferred_city: string; greeting: string }> {
  const response = await fetch(`${API_BASE}/session/${sessionId}/city`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Failed to set city (${response.status})`);
  }
  return (await response.json()) as {
    session_id: string;
    preferred_city: string;
    greeting: string;
  };
}

export async function sendTextMessage(
  sessionId: string,
  text: string,
  interruptType?: string | null,
): Promise<MessageResponse> {
  const form = new FormData();
  form.append("session_id", sessionId);
  form.append("text", text);
  if (interruptType) form.append("interrupt_type", interruptType);

  const response = await fetch(`${API_BASE}/message`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Failed to send message (${response.status})`);
  }

  return (await response.json()) as MessageResponse;
}

export async function sendAudioMessage(sessionId: string, blob: Blob): Promise<MessageResponse> {
  const form = new FormData();
  form.append("session_id", sessionId);
  form.append("audio", blob, filenameFor(blob.type));

  const response = await fetch(`${API_BASE}/message`, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Failed to send audio (${response.status})`);
  }

  return (await response.json()) as MessageResponse;
}

export async function fetchRimeSpeech(
  text: string,
  replyLang: "en" | "hi" = "en",
): Promise<ArrayBuffer> {
  const response = await fetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, reply_lang: replyLang }),
  });

  if (!response.ok) {
    let detail = await response.text();
    try {
      const parsed = JSON.parse(detail) as { detail?: string };
      if (parsed?.detail) detail = parsed.detail;
    } catch {
      /* keep raw text */
    }
    throw new Error(detail || `TTS failed (${response.status})`);
  }

  return response.arrayBuffer();
}

function filenameFor(mime: string) {
  if (mime.includes("mp4")) return "clip.m4a";
  if (mime.includes("ogg")) return "clip.ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "clip.mp3";
  return "clip.webm";
}
