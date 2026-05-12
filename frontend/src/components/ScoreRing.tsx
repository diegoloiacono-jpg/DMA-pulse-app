import { getScoreStatus } from "@/data/auditData";

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  delay?: number;
}

const colorMap = {
  excellent: "stroke-score-excellent",
  good: "stroke-score-good",
  warning: "stroke-score-warning",
  poor: "stroke-score-poor",
  critical: "stroke-score-critical",
};

const textColorMap = {
  excellent: "score-text-excellent",
  good: "score-text-good",
  warning: "score-text-warning",
  poor: "score-text-poor",
  critical: "score-text-critical",
};

export default function ScoreRing({ score, size = 140, strokeWidth = 10, label, sublabel, delay = 0 }: ScoreRingProps) {
  const status = getScoreStatus(score);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          className={colorMap[status]}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            animation: `score-fill 1.2s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms forwards`,
            strokeDashoffset: circumference,
          }}
        >
          <animate
            attributeName="stroke-dashoffset"
            from={circumference}
            to={offset}
            dur="1.2s"
            begin={`${delay}ms`}
            fill="freeze"
            calcMode="spline"
            keySplines="0.16 1 0.3 1"
            keyTimes="0;1"
          />
        </circle>
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className={`tabular-nums font-mono text-2xl font-bold ${textColorMap[status]}`}>
          {score}%
        </span>
      </div>
      {label && <span className="text-sm font-medium text-foreground">{label}</span>}
      {sublabel && <span className="text-xs text-muted-foreground">{sublabel}</span>}
    </div>
  );
}
