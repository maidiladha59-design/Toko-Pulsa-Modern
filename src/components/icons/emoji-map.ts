// Peta kompatibilitas emoji lama -> nama ikon registry.
// File ini adalah SATU-SATUNYA tempat emoji diizinkan muncul di src (dikecualikan
// oleh scripts/check-emoji.mjs) karena isinya memang data pemetaan migrasi.
import { DEFAULT_ICON_NAME, ICON_REGISTRY, type IconName } from "./registry";

export const EMOJI_TO_ICON: Record<string, IconName> = {
  "\u{1F4F1}": "pulsa",
  "\u{1F310}": "data",
  "\u{1F3AE}": "game",
  "\u{1F4B3}": "card",
  "\u26A1": "bolt",
  "\u{1F3AB}": "voucher",
  "\u25B6": "streaming",
  "\u{1F4FA}": "tv",
  "\u{1F525}": "gas",
  "\u{1F4E3}": "megaphone",
  "\u{1F4E2}": "megaphone",
  "\u{1F300}": "ticker",
  "\u{1F514}": "bell",
  "\u2B50": "star_fill",
  "\u2605": "star_fill",
  "\u2606": "star",
  "\u{1F3C6}": "trophy",
  "\u{1F947}": "trophy",
  "\u{1F948}": "medal",
  "\u{1F949}": "medal",
  "\u{1F451}": "crown",
  "\u{1F3AF}": "target",
  "\u{1F9FE}": "receipt",
  "\u{1F6CD}": "bag",
  "\u{1F6D2}": "bag",
  "\u{1F4E6}": "box",
  "\u{1F4B0}": "wallet",
  "\u{1FA99}": "coin",
  "\u{1F4B5}": "banknote",
  "\u{1F4B8}": "money_send",
  "\u{1F501}": "transfer",
  "\u21A9": "undo",
  "\u{1F3E6}": "bank",
  "\u{1F9EE}": "calculator",
  "\u{1F39A}": "sliders",
  "\u2699": "settings",
  "\u{1F6E0}": "tools",
  "\u{1F680}": "rocket",
  "\u{1F9E9}": "puzzle",
  "\u{1F5C2}": "office",
  "\u{1F4CA}": "chart_bar",
  "\u{1F4C8}": "chart_line",
  "\u{1F4B9}": "chart_line",
  "\u{1FA7A}": "activity",
  "\u{1F4DF}": "terminal",
  "\u{1F6E1}": "shield",
  "\u{1F4E1}": "signal",
  "\u{1F4F6}": "signal_off",
  "\u{1F510}": "lock",
  "\u{1F512}": "lock",
  "\u{1F511}": "key",
  "\u{1F6AB}": "ban",
  "\u{1F50C}": "plug",
  "\u{1F517}": "link",
  "\u267B": "refresh",
  "\u{1F504}": "refresh",
  "\u2B07": "download",
  "\u{1F4E5}": "inbox",
  "\u{1F4E4}": "send",
  "\u{1F5A8}": "printer",
  "\u{1F4F7}": "camera",
  "\u{1F5BC}": "image",
  "\u{1F4C4}": "doc",
  "\u{1F4CB}": "clipboard",
  "\u{1F4CE}": "paperclip",
  "\u{1F3F7}": "tag",
  "\u2753": "help",
  "\u{1F39F}": "ticket",
  "\u{1F381}": "gift",
  "\u{1F389}": "party",
  "\u{1F973}": "party",
  "\u2728": "sparkle",
  "\u23F3": "hourglass",
  "\u231B": "hourglass",
  "\u23F0": "alarm",
  "\u23F1": "timer",
  "\u{1F550}": "timer",
  "\u26A0": "warning",
  "\u274C": "close_circle",
  "\u2705": "check_circle",
  "\u2713": "check",
  "\u2714": "check",
  "\u2715": "close",
  "\u2716": "close",
  "\u2717": "close",
  "\u2600": "sun",
  "\u{1F319}": "moon",
  "\u{1F5A5}": "monitor",
  "\u{1F642}": "user",
  "\u{1F464}": "user",
  "\u{1F465}": "users",
  "\u{1F6AA}": "logout",
  "\u{1F3E0}": "home",
  "\u{1F3E2}": "building",
  "\u{1F3E8}": "hotel",
  "\u{1F3E5}": "hospital",
  "\u{1F4A7}": "water",
  "\u{1F697}": "car",
  "\u{1F4D6}": "book",
  "\u{1F4AC}": "chat",
  "\u{1F50D}": "search",
  "\u{1F50E}": "search",
  "\u{1FAAA}": "id_card",
  "\u260E": "phone",
  "\u{1F4F2}": "sim_card",
  "\u2696": "scales",
  "\u270F": "edit",
  "\u2665": "heart",
  "\u2764": "heart",
  "\u{1F44B}": "default",
  "\u{1F4A1}": "info",
  "\u2694": "game",
  "\u25C0": "chevron_left",
  "\u203A": "chevron_right",
  "\u2039": "chevron_left",
  "\u25B8": "chevron_right",
  "\u25BE": "chevron_down",
  "\u25AA": "dot",
  "\u25AB": "dot",
  "\u2022": "dot",
  "\u2192": "arrow_right",
  "\u2190": "arrow_left",
  "\u2191": "arrow_up",
  "\u2193": "arrow_down",
  "\u2194": "swap",
};

const BRAND_DOTS = new Set([
  "\u{1F534}", "\u{1F535}", "\u{1F53A}", "\u{1F53B}", "\u{1F536}", "\u{1F537}",
  "\u26AB", "\u26AA", "\u2B1B", "\u2B1C",
]);

/** Semua emoji/simbol lama yang sudah punya ikon pengganti (dipakai skrip uji ikon). */
export const EMOJI_TOKENS = Object.keys(EMOJI_TO_ICON);

const VARIATION = "\uFE0F";

function normalize(token: string): string {
  const bare = token.replace(new RegExp(VARIATION, "g"), "");
  return bare;
}

/** Nama ikon untuk sebuah emoji/simbol lama; nilai yang sudah berupa nama ikon dikembalikan apa adanya. */
export function mapEmojiToIcon(value: unknown): IconName {
  if (typeof value !== "string") return DEFAULT_ICON_NAME;
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_ICON_NAME;
  if (Object.prototype.hasOwnProperty.call(ICON_REGISTRY, trimmed)) return trimmed as IconName;
  for (const token of Array.from(normalize(trimmed))) {
    if (BRAND_DOTS.has(token)) return "dot";
    const mapped = EMOJI_TO_ICON[token];
    if (mapped) return mapped;
  }
  return DEFAULT_ICON_NAME;
}

/** Buang semua emoji/simbol dekoratif dari teks bebas (judul, pesan, body email). */
export function stripEmoji(input: string): string {
  let out = "";
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = "";
    for (const token of Array.from(previous)) {
      if (token === VARIATION) continue;
      if (BRAND_DOTS.has(token)) continue;
      if (EMOJI_TO_ICON[token]) continue;
      if (/\p{Extended_Pictographic}/u.test(token) && token !== "\u00A9" && token !== "\u00AE" && token !== "\u2122") continue;
      out += token;
    }
  }
  return out.replace(/[ \t]{2,}([.,:;!?])/g, "$1").replace(/[ \t]+$/g, "").trim();
}
