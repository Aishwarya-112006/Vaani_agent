export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export type SessionResponse = {
  session_id: string;
};

export type MessageResponse = {
  status: string;
  turn_id?: number | null;
  interrupt_type?: string | null;
};

export async function createSession(): Promise<SessionResponse> {
  const response = await fetch(`${API_BASE}/session`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`Failed to create session (${response.status})`);
  }
  return (await response.json()) as SessionResponse;
}

export async function sendAudioMessage(
  sessionId: string,
  blob: Blob,
): Promise<MessageResponse> {
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

function filenameFor(mime: string) {
  if (mime.includes("mp4")) return "clip.m4a";
  if (mime.includes("ogg")) return "clip.ogg";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "clip.mp3";
  return "clip.webm";
}
