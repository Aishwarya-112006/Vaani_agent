/**
 * Short spoken + UI copy for Vaani — English or Hinglish based on replyLang.
 * Keep lines under ~18 words so Rime / TTS stays snappy.
 */

export type ReplyLang = "en" | "hi";

export type PipelinePhase =
  | "idle"
  | "recording"
  | "uploading"
  | "understanding"
  | "acknowledging"
  | "searching"
  | "speaking"
  | "error";

const SEARCH_FILLERS_HI = [
  "Abhi search chal rahi hai…",
  "Bas thoda wait — results aa rahe hain…",
  "Almost there…",
];

const SEARCH_FILLERS_EN = ["Still searching…", "Almost there — results coming…", "One moment…"];

export function phaseLabel(phase: PipelinePhase, detail?: string, lang: ReplyLang = "en"): string {
  if (lang === "hi") {
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
  switch (phase) {
    case "recording":
      return "Listening… speak now";
    case "uploading":
      return "Sending audio…";
    case "understanding":
      return "Got it — understanding…";
    case "acknowledging":
      return detail || "Okay…";
    case "searching":
      return detail || "Searching…";
    case "speaking":
      return "Vaani is speaking…";
    case "error":
      return detail || "Something went wrong";
    default:
      return "";
  }
}

export function searchFiller(tick: number, lang: ReplyLang = "en"): string {
  const list = lang === "hi" ? SEARCH_FILLERS_HI : SEARCH_FILLERS_EN;
  return list[tick % list.length] ?? list[0]!;
}

export function ackSearch(
  type: "hotel" | "restaurant",
  params: string,
  lang: ReplyLang = "en",
): string {
  const city = params.match(/city=([^ ·]+)/)?.[1] ?? "Delhi";
  if (type === "restaurant") {
    const area = params.match(/area=([^ ·]+)/)?.[1];
    if (lang === "hi") {
      return area
        ? `Theek hai — ${area} mein restaurants dhoondh rahi hoon.`
        : `Theek hai — ${city} mein restaurants dhoondh rahi hoon.`;
    }
    return area
      ? `Okay — searching restaurants in ${area}.`
      : `Okay — searching restaurants in ${city}.`;
  }
  const budget = params.match(/budget=(\d+)/)?.[1];
  if (lang === "hi") {
    return budget
      ? `Okay, ${city} mein ₹${budget} ke under hotels check kar rahi hoon.`
      : `Okay, ${city} mein hotels dhoondh rahi hoon.`;
  }
  return budget
    ? `Okay, checking hotels in ${city} under ₹${budget} budget.`
    : `Okay, searching hotels in ${city}.`;
}

export function ackRefine(type: "hotel" | "restaurant", lang: ReplyLang = "en"): string {
  if (lang === "hi") {
    return type === "restaurant"
      ? "Samajh gayi — filters update karke dubara dhoondhti hoon."
      : "Got it — naye constraints ke saath search refresh kar rahi hoon.";
  }
  return type === "restaurant"
    ? "Got it — updating filters and searching again."
    : "Got it — refreshing the hotel search with your new filters.";
}

export function ackPivot(to: "hotel" | "restaurant", lang: ReplyLang = "en"): string {
  if (lang === "hi") {
    return to === "restaurant"
      ? "Switch kar rahi hoon — ab restaurants pe."
      : "Theek hai — ab hotels pe switch.";
  }
  return to === "restaurant"
    ? "Switching — searching restaurants now."
    : "Okay — switching to hotels.";
}

export function ackStatus(type?: string | null, lang: ReplyLang = "en"): string {
  const what = type === "restaurant" ? "restaurants" : type === "hotel" ? "hotels" : "results";
  if (lang === "hi") {
    return `Abhi ${what} search kar rahi hoon — result aate hi bolungi.`;
  }
  return `Still searching for ${what} — I'll speak as soon as I have results.`;
}

export function ackCancel(lang: ReplyLang = "en"): string {
  return lang === "hi"
    ? "Okay, search band. Aur kuch try karein?"
    : "Okay, search cancelled. Want to try something else?";
}

export function resultHotels(city: string, budget: string, lang: ReplyLang = "en"): string {
  if (lang === "hi") {
    return `${city}, ${budget} ke under — 3 hotels. Lotus Residency, Metro Inn, Green Leaf.`;
  }
  return `${city}, under ${budget} — 3 hotels. Lotus Residency, Metro Inn, Green Leaf.`;
}

export function resultRestaurants(place: string, lang: ReplyLang = "en"): string {
  if (lang === "hi") {
    return `${place} — 3 restaurants. Saffron Thali, Coastal Catch, Green Bowl.`;
  }
  return `${place} — 3 restaurants. Saffron Thali, Coastal Catch, Green Bowl.`;
}

export function errMic(): string {
  return "Mic nahi mila. Browser permission check karo.";
}

export function errShortClip(): string {
  return "Audio nahi mila — mic click karke bolo, phir dubara click to send.";
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

export function voiceBridge(lang: ReplyLang = "en"): string {
  return lang === "hi" ? "Ek second…" : "One second…";
}
