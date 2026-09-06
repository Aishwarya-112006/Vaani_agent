export const API_BASE = import.meta.env["VITE_API_URL"] ?? "http://localhost:8000";

export type SessionResponse = {
  session_id: string;
};

export type MessageResponse = {
  status: string;
  turn_id?: number | null;
  interrupt_type?: string | null;
  active_request_id?: string | null;
  transcript?: string | null;
};

export async function createSession(): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE}/session`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to create session (${response.status})`);
  }
  return (await response.json()) as SessionResponse;
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

export async function fetchRimeSpeech(text: string): Promise<ArrayBuffer> {
  const response = await fetch(`${API_BASE}/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const detail = await response.text();
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
