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

export type ConstraintKey = "city" | "budget" | "veg" | "metro" | "cuisine" | "area";

/** Human label for an active filter chip (UI). */
export function constraintChipLabel(key: ConstraintKey, value: string, lang: ReplyLang = "en"): string {
  switch (key) {
    case "city":
      return value;
    case "budget":
      return `₹${value}`;
    case "veg":
      return lang === "hi" ? "veg" : "veg";
    case "metro":
      return lang === "hi" ? "metro" : "metro";
    case "cuisine":
      return value;
    case "area":
      return value;
  }
}

/** Spoken confirm of filters before the first search (optional product line). */
export function confirmSearch(
  type: "hotel" | "restaurant",
  params: string,
  lang: ReplyLang = "en",
): string {
  const parts = params.split(" · ").filter(Boolean);
  const city = parts.find((p) => p.startsWith("city="))?.slice(5) ?? "Delhi";
  const budget = parts.find((p) => p.startsWith("budget="))?.slice(7);
  const area = parts.find((p) => p.startsWith("area="))?.slice(5);
  const cuisine = parts.find((p) => p.startsWith("cuisine="))?.slice(8);
  const veg = parts.some((p) => p === "veg_only=true");
  const metro = parts.some((p) => p === "near_metro=true");

  const tags: string[] = [city];
  if (area) tags.push(area);
  if (budget) tags.push(`₹${budget}`);
  if (cuisine) tags.push(cuisine);
  if (veg) tags.push(lang === "hi" ? "veg" : "veg");
  if (metro) tags.push(lang === "hi" ? "metro ke paas" : "near metro");
  const list = tags.join(" · ");

  if (lang === "hi") {
    return type === "restaurant"
      ? `Confirm: ${list}. Restaurants dhoondhti hoon.`
      : `Confirm: ${list}. Hotels dhoondhti hoon.`;
  }
  return type === "restaurant"
    ? `Confirming ${list}. Searching restaurants now.`
    : `Confirming ${list}. Searching hotels now.`;
}

export function ackSearch(
  type: "hotel" | "restaurant",
  params: string,
  lang: ReplyLang = "en",
): string {
  // Prefer the explicit confirm line for first search
  return confirmSearch(type, params, lang);
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

export function factFallback(lang: ReplyLang = "en"): string {
  return lang === "hi"
    ? "Woh nahi mila — search continue kar rahi hoon."
    : "Sorry, I couldn't find that — search is still running.";
}

export function factLabel(lang: ReplyLang = "en"): string {
  return lang === "hi" ? "Fact aside" : "Quick fact";
}

export function greetCity(city: string, lang: ReplyLang = "en"): string {
  const name = city.trim() || "Delhi";
  return lang === "hi" ? `Namaste! ${name} ke paas search karein?` : `Hi! Searching near ${name}?`;
}

export function confirmCity(city: string, lang: ReplyLang = "en"): string {
  const name = city.trim() || "Delhi";
  return lang === "hi"
    ? `Theek hai — ${name} set. Hotels ya restaurants bolo.`
    : `Got it — searching near ${name}. Ask for hotels or restaurants.`;
}

export const CITY_CHIPS = [
  "Delhi",
  "Mumbai",
  "Bangalore",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Kolkata",
  "Goa",
  "Jaipur",
] as const;
