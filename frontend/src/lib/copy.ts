/**
 * Short, natural Hinglish-aware spoken + UI copy for Vaani.
 * Keep lines under ~18 words so Rime / TTS stays snappy.
 */

export type PipelinePhase =
  | "idle"
  | "recording"
  | "uploading"
  | "understanding"
  | "acknowledging"
  | "searching"
  | "speaking"
  | "error";

const SEARCH_FILLERS = [
  "Abhi search chal rahi hai…",
  "Bas thoda wait — results aa rahe hain…",
  "Almost there…",
];

export function phaseLabel(phase: PipelinePhase, detail?: string): string {
  switch (phase) {
    case "recording":
      return "Sun rahi hoon… bolo";
    case "uploading":
      return "Audio bhej rahi hoon…";
    case "understanding":
      return "Samajh rahi hoon…";
    case "acknowledging":
      return detail || "Theek hai…";
    case "searching":
      return detail || "Search chal rahi hai…";
    case "speaking":
      return "Vaani bol rahi hai…";
    case "error":
      return detail || "Kuch gadbad ho gayi";
    default:
      return "";
  }
}

export function searchFiller(tick: number): string {
  return SEARCH_FILLERS[tick % SEARCH_FILLERS.length] ?? SEARCH_FILLERS[0]!;
}

export function ackSearch(type: "hotel" | "restaurant", params: string): string {
  const city = params.match(/city=([^ ·]+)/)?.[1] ?? "Delhi";
  if (type === "restaurant") {
    const area = params.match(/area=([^ ·]+)/)?.[1];
    return area
      ? `Theek hai — ${area} mein restaurants dhoondh rahi hoon.`
      : `Theek hai — ${city} mein restaurants dhoondh rahi hoon.`;
  }
  const budget = params.match(/budget=(\d+)/)?.[1];
  return budget
    ? `Okay, ${city} mein ₹${budget} ke under hotels check kar rahi hoon.`
    : `Okay, ${city} mein hotels dhoondh rahi hoon.`;
}

export function ackRefine(type: "hotel" | "restaurant"): string {
  return type === "restaurant"
    ? "Samajh gayi — filters update karke dubara dhoondhti hoon."
    : "Got it — naye constraints ke saath search refresh kar rahi hoon.";
}

export function ackPivot(to: "hotel" | "restaurant"): string {
  return to === "restaurant"
    ? "Switch kar rahi hoon — ab restaurants pe."
    : "Theek hai — ab hotels pe switch.";
}

export function ackStatus(type?: string | null): string {
  const what = type === "restaurant" ? "restaurants" : type === "hotel" ? "hotels" : "results";
  return `Abhi ${what} search kar rahi hoon — result aate hi bolungi.`;
}

export function ackCancel(): string {
  return "Okay, search band. Aur kuch try karein?";
}

export function resultHotels(city: string, budget: string): string {
  return `${city} mein ₹${budget} ke under 3 hotels mili. Top pick: The Lotus Residency — breakfast included.`;
}

export function resultRestaurants(place: string): string {
  return `${place} mein 3 solid options. Top pick: Saffron Thali — open now, bahut acchi rating.`;
}

export function errMic(): string {
  return "Mic nahi mila. Browser permission check karo.";
}

export function errShortClip(): string {
  return "Bahut short tha — button hold karke bolo, phir chhodo.";
}

export function errSttEmpty(): string {
  return "Samajh nahi paayi. Ek baar aur bolo?";
}

export function errNetwork(detail?: string): string {
  const short = detail?.replace(/\s+/g, " ").trim().slice(0, 80);
  return short ? `Network issue: ${short}` : "Network issue — thodi der baad try karo.";
}

export function errTts(): string {
  return "Voice ready nahi hui, text pe dekh lo.";
}

export function voiceBridge(): string {
  return "Ek second…";
}
