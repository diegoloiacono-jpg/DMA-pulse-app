/**
 * Subtle accent colors per platform — used to theme borders/headers
 * when drilling down from Overview into a specific platform tab.
 * Returns Tailwind utility class fragments (border + bg tints).
 */
export interface PlatformAccent {
  border: string;   // e.g. "border-blue-500/40"
  ring: string;     // e.g. "ring-blue-500/20"
  bg: string;       // e.g. "bg-blue-500/5"
  text: string;     // e.g. "text-blue-600"
  dot: string;      // e.g. "bg-blue-500"
  label: string;
}

const ACCENTS: Record<string, PlatformAccent> = {
  "sea-google":  { border: "border-blue-500/40",   ring: "ring-blue-500/20",   bg: "bg-blue-500/5",   text: "text-blue-600",   dot: "bg-blue-500",   label: "Google Ads" },
  "meta":        { border: "border-indigo-500/40", ring: "ring-indigo-500/20", bg: "bg-indigo-500/5", text: "text-indigo-600", dot: "bg-indigo-500", label: "Meta" },
  "linkedin":    { border: "border-sky-600/40",    ring: "ring-sky-600/20",    bg: "bg-sky-600/5",    text: "text-sky-700",    dot: "bg-sky-600",    label: "LinkedIn" },
  "sea-bing":    { border: "border-teal-500/40",   ring: "ring-teal-500/20",   bg: "bg-teal-500/5",   text: "text-teal-600",   dot: "bg-teal-500",   label: "Bing" },
  "pinterest":   { border: "border-red-500/40",    ring: "ring-red-500/20",    bg: "bg-red-500/5",    text: "text-red-600",    dot: "bg-red-500",    label: "Pinterest" },
  "tiktok":      { border: "border-pink-500/40",   ring: "ring-pink-500/20",   bg: "bg-pink-500/5",   text: "text-pink-600",   dot: "bg-pink-500",   label: "TikTok" },
  "snapchat":    { border: "border-yellow-500/40", ring: "ring-yellow-500/20", bg: "bg-yellow-500/5", text: "text-yellow-700", dot: "bg-yellow-500", label: "Snapchat" },
  "dv360":       { border: "border-green-500/40",  ring: "ring-green-500/20",  bg: "bg-green-500/5",  text: "text-green-600",  dot: "bg-green-500",  label: "DV360" },
};

const DEFAULT_ACCENT: PlatformAccent = {
  border: "border-border", ring: "ring-primary/10", bg: "bg-card", text: "text-foreground", dot: "bg-muted-foreground", label: "Default",
};

export function getPlatformAccent(platformId?: string | null): PlatformAccent {
  if (!platformId) return DEFAULT_ACCENT;
  return ACCENTS[platformId] ?? DEFAULT_ACCENT;
}
