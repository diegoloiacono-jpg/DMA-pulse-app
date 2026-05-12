import { useRef, useCallback } from "react";
import { Download } from "lucide-react";
import { type PlatformCategory } from "@/data/auditData";
import type { ConfidenceLevel } from "@/utils/auditCriteria";

interface Props {
  categories: PlatformCategory[];
  label: string;
  showBenchmark?: boolean;
  benchmarkScore?: number;
  confidence?: ConfidenceLevel;
  /** Indices of categories that have no data — shown grayed out instead of 0% */
  noDataIndices?: number[];
  /** Indices of categories boosted by expert manual verification */
  expertVerifiedIndices?: number[];
}

const CORPORATE_MAGENTA = "hsl(336, 100%, 50%)";

const CORPORATE_INDIGO = "hsl(233, 49%, 30%)";
const GRID_COLOR = "hsl(210, 18%, 88%)";
const GRID_COLOR_LIGHT = "hsl(210, 18%, 93%)";
const LABEL_COLOR = "hsl(215, 25%, 27%)"; /* Slate 800 equivalent */

const CONFIDENCE_STYLES: Record<ConfidenceLevel, { color: string; label: string; icon: string; description: string }> = {
  high: { color: "hsl(142, 71%, 45%)", label: "High Confidence", icon: "●", description: "Verified via Data" },
  medium: { color: "hsl(48, 96%, 53%)", label: "Medium Confidence", icon: "◐", description: "Partial Data Available" },
  low: { color: "hsl(0, 84%, 60%)", label: "Low Confidence", icon: "○", description: "Manual Assessment Required" },
  none: { color: "hsl(210, 18%, 70%)", label: "Not Assessed", icon: "—", description: "No Data Available" },
};

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default function RadarChart({ categories, label, showBenchmark = true, benchmarkScore = 50, confidence, noDataIndices = [], expertVerifiedIndices = [] }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const size = 500;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 140;
  const levels = [25, 50, 75, 100];
  const n = categories.length;

  const handleDownload = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return;

    // ─── Build a self-contained export SVG with padding + legend ───
    const PAD = Math.round(size * 0.2);          // 20% safe-zone buffer
    const LEGEND_H = 70;
    const exportW = size + PAD * 2;
    const exportH = size + PAD * 2 + LEGEND_H;

    // Clone the chart SVG inner content
    const inner = svg.innerHTML;

    // Legend swatches inline (Client / Benchmark / Expert Verified)
    const legendItems: string[] = [];
    legendItems.push(
      `<g transform="translate(0,0)">
        <circle cx="8" cy="8" r="6" fill="${CORPORATE_MAGENTA}"/>
        <text x="22" y="12" font-family="system-ui" font-size="13" font-weight="600" fill="${LABEL_COLOR}">${escapeXml(label)}</text>
      </g>`
    );
    if (showBenchmark) {
      legendItems.push(
        `<g>
          <circle cx="8" cy="8" r="6" fill="${CORPORATE_INDIGO}" opacity="0.5"/>
          <text x="22" y="12" font-family="system-ui" font-size="13" fill="${LABEL_COLOR}">Benchmark</text>
        </g>`
      );
    }
    if (expertVerifiedIndices.length > 0) {
      legendItems.push(
        `<g>
          <circle cx="8" cy="8" r="6" fill="hsl(294, 46%, 50%)"/>
          <text x="22" y="12" font-family="system-ui" font-size="13" font-weight="600" fill="hsl(294, 46%, 33%)">Expert Verified</text>
        </g>`
      );
    }

    // Lay out legend items horizontally with simple width estimate
    const itemWidths = legendItems.map((_, i) => {
      const labels = ["client", "benchmark", "expert"];
      const txt = i === 0 ? label : (labels[i] ?? "");
      return 32 + Math.max(80, txt.length * 8);
    });
    const totalW = itemWidths.reduce((s, w) => s + w, 0) + (legendItems.length - 1) * 24;
    let xCursor = (exportW - totalW) / 2;
    const placedLegend = legendItems.map((g, i) => {
      const wrapped = `<g transform="translate(${xCursor}, ${size + PAD * 2 + 22})">${g}</g>`;
      xCursor += itemWidths[i] + 24;
      return wrapped;
    }).join("");

    const exportSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${exportW}" height="${exportH}" viewBox="0 0 ${exportW} ${exportH}">
      <rect width="${exportW}" height="${exportH}" fill="#ffffff"/>
      <g transform="translate(${PAD}, ${PAD})">${inner}</g>
      ${placedLegend}
    </svg>`;

    const canvas = document.createElement("canvas");
    const scale = 3;                              // Retina quality
    canvas.width = exportW * scale;
    canvas.height = exportH * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const link = document.createElement("a");
      link.download = `${label.replace(/\s+/g, "_")}_radar.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(exportSvg)));
  }, [label, size, showBenchmark, expertVerifiedIndices.length]);

  if (n < 3) return null;

  const angleSlice = (Math.PI * 2) / n;

  const getPoint = (index: number, value: number) => {
    const angle = angleSlice * index - Math.PI / 2;
    const r = (value / 100) * radius;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const dataPoints = categories.map((cat, i) => getPoint(i, cat.score));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  const benchPoints = categories.map((_, i) => getPoint(i, benchmarkScore));
  const benchPath = benchPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ") + " Z";

  const confStyle = confidence ? CONFIDENCE_STYLES[confidence] : null;

  /** Wrap long label text into multiple tspan lines */
  const wrapLabel = (text: string, maxChars: number): string[] => {
    if (text.length <= maxChars) return [text];
    // Split on " / " first for explicit breaks
    if (text.includes(" / ")) {
      return text.split(" / ").map((s, i, arr) => i < arr.length - 1 ? s + " /" : s);
    }
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      if (current && (current + " " + word).length > maxChars) {
        lines.push(current);
        current = word;
      } else {
        current = current ? current + " " + word : word;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  return (
    <div className="flex flex-col items-center gap-3 max-w-[560px] w-full mx-auto">
      <div className="relative w-full">
        <button
          onClick={handleDownload}
          className="absolute -top-8 right-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium
                     bg-muted/50 border border-border text-muted-foreground
                     hover:text-foreground hover:bg-muted transition-colors active:scale-[0.97] z-10"
          title="Download radar chart as PNG"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${size} ${size}`}
          className="w-full overflow-visible"
          aria-label={`${label} category radar`}
        >
          {/* Grid circles */}
          {levels.map(level => {
            const r = (level / 100) * radius;
            return (
              <circle
                key={level}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={GRID_COLOR_LIGHT}
                strokeWidth={1}
                strokeDasharray={level === 100 ? "none" : "3 3"}
              />
            );
          })}

          {/* Level labels */}
          {levels.map(level => {
            const r = (level / 100) * radius;
            return (
              <text
                key={`label-${level}`}
                x={cx + 4}
                y={cy - r + 4}
                fill="hsl(215, 16%, 57%)"
                fontSize="9"
                fontFamily="system-ui"
              >
                {level}%
              </text>
            );
          })}

          {/* Axis lines */}
          {categories.map((_, i) => {
            const end = getPoint(i, 100);
            const isNoData = noDataIndices.includes(i);
            return (
              <line
                key={`axis-${i}`}
                x1={cx}
                y1={cy}
                x2={end.x}
                y2={end.y}
                stroke={isNoData ? "hsl(210, 18%, 92%)" : GRID_COLOR}
                strokeWidth={1}
                strokeDasharray={isNoData ? "4 4" : "none"}
              />
            );
          })}

          {/* Benchmark polygon */}
          {showBenchmark && (
            <>
              <path
                d={benchPath}
                fill="none"
                stroke={CORPORATE_INDIGO}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.5}
              />
              {benchPoints.map((p, i) => (
                <circle
                  key={`bench-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={3}
                  fill={CORPORATE_INDIGO}
                  opacity={0.5}
                />
              ))}
            </>
          )}

          {/* Data polygon fill */}
          <path
            d={dataPath}
            fill={CORPORATE_MAGENTA}
            fillOpacity={0.1}
            stroke={CORPORATE_MAGENTA}
            strokeWidth={2}
          />

          {/* Data dots */}
          {dataPoints.map((p, i) => {
            const isNoData = noDataIndices.includes(i);
            return (
              <circle
                key={`dot-${i}`}
                cx={p.x}
                cy={p.y}
                r={5}
                fill={isNoData ? "hsl(210, 18%, 80%)" : CORPORATE_MAGENTA}
                stroke="white"
                strokeWidth={2}
                opacity={isNoData ? 0.5 : 1}
              />
            );
          })}

          {/* Category labels — single-line via foreignObject (no wrapping) */}
          {categories.map((cat, i) => {
            const labelRadius = radius + 50;
            const angle = angleSlice * i - Math.PI / 2;
            const lx = cx + labelRadius * Math.cos(angle);
            const ly = cy + labelRadius * Math.sin(angle);
            const isNoData = noDataIndices.includes(i);
            const isExpertVerified = expertVerifiedIndices.includes(i);

            const boxWidth = 200;
            // Anchor the label box so its inner alignment matches its angular position
            let align: "center" | "left" | "right" = "center";
            let boxX = lx - boxWidth / 2;
            if (Math.cos(angle) > 0.1)      { align = "left";   boxX = lx; }
            else if (Math.cos(angle) < -0.1){ align = "right";  boxX = lx - boxWidth; }

            return (
              <foreignObject
                key={`cat-${i}`}
                x={boxX}
                y={ly - 22}
                width={boxWidth}
                height={44}
                style={{ overflow: "visible" }}
              >
                <div
                  {...({ xmlns: "http://www.w3.org/1999/xhtml" } as Record<string, string>)}
                  style={{
                    width: `${boxWidth}px`,
                    textAlign: align,
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    color: isNoData ? "hsl(215, 16%, 72%)" : LABEL_COLOR,
                    lineHeight: 1.15,
                  }}
                >
                  <div style={{ fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {cat.name}
                  </div>
                  {isNoData && (
                    <div style={{ fontSize: "9px", fontStyle: "italic", color: "hsl(215, 16%, 72%)" }}>
                      No data
                    </div>
                  )}
                  {isExpertVerified && !isNoData && (
                    <div style={{ fontSize: "9px", fontWeight: 600, color: "hsl(294, 46%, 33%)" }}>
                      ✓ Expert Verified
                    </div>
                  )}
                </div>
              </foreignObject>
            );
          })}


        </svg>

      </div>

      {/* Confidence Legend */}
      {confStyle && (
        <div className="flex items-center gap-2 text-[11px] border border-border rounded-md px-3 py-1.5">
          <span
            className="w-2.5 h-2.5 rounded-full inline-block"
            style={{ background: confStyle.color, opacity: confidence === 'none' || confidence === 'low' ? 0.4 : 1 }}
          />
          <span className="text-foreground font-medium">{confStyle.label}</span>
          <span className="text-muted-foreground">— {confStyle.description}</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs flex-wrap justify-center">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full" style={{ background: CORPORATE_MAGENTA }} />
          <span className="text-foreground font-medium">{label}</span>
        </div>
        {showBenchmark && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: CORPORATE_INDIGO, opacity: 0.5 }} />
            <span className="text-muted-foreground">Benchmark</span>
          </div>
        )}
        {noDataIndices.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ background: "hsl(210, 18%, 80%)" }} />
            <span className="text-muted-foreground">No data</span>
          </div>
        )}
        {expertVerifiedIndices.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-accent" />
            <span className="text-accent font-medium">Expert Verified</span>
          </div>
        )}
      </div>

      {/* Maturity scale */}
      <div className="text-center text-[10px] text-muted-foreground border border-border rounded-lg px-4 py-2">
        <p className="font-medium mb-0.5">Maturity score levels:</p>
        <div className="flex gap-6 justify-center">
          <span>0-25 Basic</span>
          <span>26-50 Advanced</span>
          <span>51-75 Expert</span>
          <span>76-100 Champion</span>
        </div>
      </div>
    </div>
  );
}
