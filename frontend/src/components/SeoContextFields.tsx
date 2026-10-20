import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { SeoContextPayload } from "@/lib/apiClient";

const INPUT =
  "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const toList = (text: string) => text.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
const toMap = (text: string) =>
  Object.fromEntries(
    text.split("\n")
      .map(line => line.split(":"))
      .filter(parts => parts.length >= 2 && parts[0].trim())
      .map(([k, ...rest]) => [k.trim(), rest.join(":").trim()]),
  );
const fromMap = (m: Record<string, string>) => Object.entries(m).map(([k, v]) => `${k}: ${v}`).join("\n");

/** List and key/value fields keep their own text while typing, and parse it when the field loses focus. */
function ListField({ label, hint, value, onCommit, rows }: {
  label: string;
  hint: string;
  value: string;
  onCommit: (text: string) => void;
  rows?: number;
}) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value;
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-foreground">{label}</label>
      {rows ? (
        <textarea
          value={shown}
          rows={rows}
          placeholder={hint}
          onFocus={() => { setText(value); setFocused(true); }}
          onChange={e => setText(e.target.value)}
          onBlur={() => { setFocused(false); onCommit(text); }}
          className={`${INPUT} resize-none`}
        />
      ) : (
        <input
          type="text"
          value={shown}
          placeholder={hint}
          onFocus={() => { setText(value); setFocused(true); }}
          onChange={e => setText(e.target.value)}
          onBlur={() => { setFocused(false); onCommit(text); }}
          className={INPUT}
        />
      )}
    </div>
  );
}

interface Props {
  value: SeoContextPayload;
  onChange: (next: SeoContextPayload) => void;
}

/** The SEO fields of the brand context (seo/SEO_METRICS.md, "Brand context"). */
export default function SeoContextFields({ value, onChange }: Props) {
  const [more, setMore] = useState(false);
  const set = <K extends keyof SeoContextPayload>(key: K, v: SeoContextPayload[K]) => onChange({ ...value, [key]: v });

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-foreground">Site URL</label>
        <input
          type="text"
          value={value.siteUrl}
          onChange={e => set("siteUrl", e.target.value)}
          placeholder="e.g. www.client.nl"
          className={INPUT}
        />
      </div>

      <ListField
        label="Brand terms"
        hint="e.g. client, client shop (comma-separated)"
        value={value.brandTerms.join(", ")}
        onCommit={t => set("brandTerms", toList(t))}
      />
      <ListField
        label="Competitors"
        hint="e.g. competitor.nl, other.com"
        value={value.competitors.join(", ")}
        onCommit={t => set("competitors", toList(t))}
      />


      <button
        type="button"
        onClick={() => setMore(m => !m)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${more ? "rotate-180" : ""}`} />
        More SEO context
      </button>

      {more && (
        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-3">
          <ListField
            label="Page types (type: URL pattern, one per line)"
            hint={"product: /p/\ncategory: /c/\nblog: /blog/"}
            value={fromMap(value.pageTypes)}
            onCommit={t => set("pageTypes", toMap(t))}
            rows={3}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Keyword mapping (link)</label>
              <input type="text" value={value.keywordMappingUrl} onChange={e => set("keywordMappingUrl", e.target.value)}
                placeholder="https://…" className={INPUT} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Keyword mapping updated</label>
              <input type="date" value={value.keywordMappingDate} onChange={e => set("keywordMappingDate", e.target.value)}
                className={INPUT} />
            </div>
          </div>
          <ListField
            label="Review platforms"
            hint="B2C: Google, Trustpilot · B2B: G2, Clutch"
            value={value.reviewPlatforms.join(", ")}
            onCommit={t => set("reviewPlatforms", toList(t))}
          />
          <ListField
            label="Expected external profiles"
            hint="e.g. LinkedIn, Crunchbase, Instagram"
            value={value.expectedProfiles.join(", ")}
            onCommit={t => set("expectedProfiles", toList(t))}
          />
          <ListField
            label="AI bot policy (bot: allow/block, one per line)"
            hint={"GPTBot: allow\nGoogle-Extended: block"}
            value={fromMap(value.aiBotPolicy)}
            onCommit={t => set("aiBotPolicy", toMap(t))}
            rows={3}
          />
          <ListField
            label="Intentional nosnippet / max-snippet (URLs or patterns)"
            hint="e.g. /account/, /legal/"
            value={value.snippetExceptions.join(", ")}
            onCommit={t => set("snippetExceptions", toList(t))}
          />
          <ListField
            label="AI shopping platforms in scope"
            hint="e.g. ChatGPT shopping"
            value={value.aiShoppingPlatforms.join(", ")}
            onCommit={t => set("aiShoppingPlatforms", toList(t))}
          />
        </div>
      )}
    </div>
  );
}
