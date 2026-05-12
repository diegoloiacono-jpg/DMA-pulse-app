import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format currency values in executive compact style: $1,250,000 → $1.3M */
export function formatCompact(value: number, currency = true): string {
  const formatter = new Intl.NumberFormat("en-US", {
    ...(currency ? { style: "currency", currency: "USD" } : {}),
    notation: "compact",
    compactDisplay: "short",
    maximumFractionDigits: 1,
  });
  return formatter.format(value);
}
