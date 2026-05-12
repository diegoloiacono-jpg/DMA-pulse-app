import { useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import artefactLogo from "@/assets/artefact-logo-white.png";
import { Settings, FileSpreadsheet, Upload, ArrowRight, AlertCircle, X, ChevronDown, Zap, Lightbulb, Sparkles, Check, XCircle, PlayCircle, Home, TrendingUp, Trash2, Info, RotateCcw, AlertTriangle } from "lucide-react";
import DataGapsFlyout, { generateDataGaps } from "@/components/DataGapsFlyout";
import { analyzeAIReadiness } from "@/utils/aiAudit";
import { platforms, omnichannelScore, type Platform } from "@/data/auditData";
import FileUpload, { type UploadedFile } from "@/components/FileUpload";
import AuditRunner from "@/components/AuditRunner";
import SpecialistReview from "@/components/SpecialistReview";
import ScoringReview from "@/components/ScoringReview";
import { apiClient, type AuditState as ApiAuditState, type ScoringOutput as ApiScoringOutput } from "@/lib/apiClient";
import MastercardDashboard from "@/components/MastercardDashboard";
import CategoryBreakdown from "@/components/CategoryBreakdown";

import PlatformMaturityGrid from "@/components/PlatformMaturityGrid";
import ValidationLayer from "@/components/ValidationLayer";
import StrategicWins from "@/components/StrategicWins";
import RawDataPreview from "@/components/RawDataPreview";
import { type BrandContext, DEFAULT_BRAND_CONTEXT, getEffectiveBenchmark, PLATFORM_OPTIONS, type PlatformKey } from "@/utils/brandContext";
import { computeDashboardState, type DashboardState } from "@/utils/dashboardLogic";
import {
  type ManualScoreMap,
  type ManualScore,
  scorePlatformManual,
  scoreOmnichannelManual,
  hasManualScores,
  getScoredCount,
  getCategoryPassRate,
} from "@/utils/auditCriteria";
import { generateSampleScores, generateSampleFiles, getStrategicGuess, getNamingGhostPreview } from "@/utils/sampleData";
import { getTopStrategicWins } from "@/utils/roadmapLogic";
import { getPlatformAccent } from "@/utils/platformColors";

const platformKeyMap: Record<string, string[]> = {
  "sea-google": ["google"],
  "meta": ["meta"],
  "linkedin": ["linkedin"],
  "sea-bing": ["bing"],
  "pinterest": ["pinterest"],
  "tiktok": ["tiktok"],
  "snapchat": ["snapchat"],
  "dv360": ["google", "dv360"],
};

const platformExportGuide: Record<string, string> = {
  "sea-google": "Google Ads → Reports → Custom → Download CSV",
  "meta": "Meta Ads Manager → Export Table Data → CSV/XLSX",
  "linkedin": "LinkedIn Campaign Manager → Reports → Export → CSV",
  "sea-bing": "Microsoft Ads → Reports → Download → CSV",
  "pinterest": "Pinterest Ads → Analytics → Export",
  "tiktok": "TikTok Ads Manager → Campaign → Export",
  "snapchat": "Snapchat Ads Manager → Export Data → CSV",
  "dv360": "DV360 → Reports → Download → CSV",
};

export default function Index() {
  const [selectedPlatformId, setSelectedPlatformId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [brandContext, setBrandContext] = useState<BrandContext>(DEFAULT_BRAND_CONTEXT);
  const [manualScores, setManualScores] = useState<ManualScoreMap>({});
  const [showGapsFlyout, setShowGapsFlyout] = useState(false);

  // BigQuery audit flow
  const [auditId, setAuditId] = useState<string | null>(null);
  const [apiAuditState, setApiAuditState] = useState<ApiAuditState | null>(null);
  const [apiScoringOutput, setApiScoringOutput] = useState<ApiScoringOutput | null>(null);

  const handleScoreChange = useCallback((key: string, score: ManualScore) => {
    setManualScores(prev => ({ ...prev, [key]: score }));
  }, []);

  const selectedPlatform = selectedPlatformId
    ? platforms.find(p => p.id === selectedPlatformId) ?? null
    : null;

  const readyFiles = uploadedFiles.filter(f => f.status === "ready");
  const activeSourceFiles = selectedPlatformId
    ? readyFiles.filter(f => {
        const keys = platformKeyMap[selectedPlatformId] || [];
        return keys.includes(f.platform);
      })
    : readyFiles;

  const hasDataForPlatform = (platformId: string) => {
    const keys = platformKeyMap[platformId] || [];
    return readyFiles.some(f => keys.includes(f.platform));
  };

  // ─── Compute dashboard state from uploaded data + brand context ───
  const allUploadedRows = useMemo(
    () => readyFiles.flatMap(f => f.data),
    [readyFiles]
  );

  const dashboardState: DashboardState | null = useMemo(() => {
    if (allUploadedRows.length === 0) return null;
    return computeDashboardState(allUploadedRows, brandContext);
  }, [allUploadedRows, brandContext]);

  const manualActive = hasManualScores(manualScores);
  const hasRealData = manualActive || readyFiles.length > 0;

  // Blended maturity: manual scores > uploaded data > static audit
  const liveMaturity = useMemo(() => {
    if (manualActive) {
      const manualOmni = scoreOmnichannelManual(platforms, manualScores, brandContext.model);
      if (dashboardState) {
        return Math.round(manualOmni * 0.5 + dashboardState.overallMaturity * 0.3 + omnichannelScore * 0.2);
      }
      return Math.round(manualOmni * 0.7 + omnichannelScore * 0.3);
    }
    if (!dashboardState) return omnichannelScore;
    return Math.round(dashboardState.overallMaturity * 0.6 + omnichannelScore * 0.4);
  }, [dashboardState, manualScores, manualActive, brandContext.model]);

  const showMissingData = selectedPlatformId && !hasDataForPlatform(selectedPlatformId);

  // AI audit for Google Ads
  const aiAudit = useMemo(() => {
    if (allUploadedRows.length === 0) return null;
    return analyzeAIReadiness(allUploadedRows);
  }, [allUploadedRows]);

  const currentInjectedActions = (selectedPlatformId === "sea-google" || !selectedPlatformId)
    ? (aiAudit?.injectedActions || [])
    : [];

  // Per-platform live score
  const getPlatformLiveScore = (p: Platform): number => {
    if (manualActive) {
      const manualScore = scorePlatformManual(p, manualScores, brandContext.model);
      if (dashboardState) {
        const keys = platformKeyMap[p.id] || [];
        const cs = keys.map(k => dashboardState.consistencyScores[k]).filter(Boolean);
        if (cs.length > 0) {
          const avgConsistency = cs.reduce((s, c) => s + c.score, 0) / cs.length;
          return Math.round(manualScore * 0.5 + avgConsistency * 0.3 + p.weightedScore * 0.2);
        }
      }
      return Math.round(manualScore * 0.7 + p.weightedScore * 0.3);
    }
    if (!dashboardState) return p.weightedScore;
    const keys = platformKeyMap[p.id] || [];
    const cs = keys.map(k => dashboardState.consistencyScores[k]).filter(Boolean);
    if (cs.length === 0) return p.weightedScore;
    const avgConsistency = cs.reduce((s, c) => s + c.score, 0) / cs.length;
    return Math.round(avgConsistency * 0.5 + p.weightedScore * 0.5);
  };

  // ─── Hero Stats ───
  const heroStats = useMemo(() => {
    const totalTopics = platforms.reduce((s, p) => s + p.totalTopics, 0);
    const failingTopics = platforms.reduce((s, p) => {
      return s + p.categories.reduce((cs, c) => {
        return cs + c.topics.filter(t => Object.values(t.scores).some(v => !v)).length;
      }, 0);
    }, 0);
    const rawInefficiency = totalTopics > 0 ? Math.round((failingTopics / totalTopics) * 100) : 0;
    const inefficiency = Math.min(rawInefficiency, 30);

    const dataGaps = platforms.filter(p => !hasDataForPlatform(p.id) && !(manualActive && getScoredCount(p, manualScores).scored > 0)).length;

    const targetPlatforms = selectedPlatformId ? platforms.filter(p => p.id === selectedPlatformId) : platforms;
    const wins = getTopStrategicWins(targetPlatforms, brandContext.model, manualScores, 3);
    const baseUplift = Math.min(wins.reduce((s, w) => s + w.potentialIncrease, 0), 35);

    // B2B: Bind Lead Quality uplift to Audiences/Targeting category pass rate
    // + extra boost for CRM/routing manual verifications
    let uplift = baseUplift;
    if (brandContext.model === "B2B") {
      const audienceCats = targetPlatforms.flatMap(p =>
        p.categories.filter(c => c.name.toLowerCase().includes("audience"))
      );
      if (audienceCats.length > 0) {
        const avgAudienceScore = audienceCats.reduce((s, c) => {
          const pId = targetPlatforms.find(p => p.categories.includes(c))?.id || "";
          return s + getCategoryPassRate(pId, c, manualScores);
        }, 0) / audienceCats.length;
        uplift = Math.round(2 + (avgAudienceScore / 100) * 33);
      }

      // CRM / Lead Routing manual verification bonus
      const crmKeywords = ["lead routing", "crm integration", "crm", "lead gen", "capi", "conversion api", "enhanced conversion", "offline conversion"];
      let crmBoost = 0;
      for (const [key, score] of Object.entries(manualScores)) {
        if (score >= 2) {
          const topicPart = key.split("::").slice(1).join("::").toLowerCase();
          if (crmKeywords.some(kw => topicPart.includes(kw))) {
            crmBoost += score === 3 ? 4 : 2;
          }
        }
      }
      uplift = uplift + Math.min(crmBoost, 12);
      uplift = Math.min(uplift, 35);
    }

    return { inefficiency, dataGaps, uplift };
  }, [selectedPlatformId, manualScores, manualActive, brandContext.model, readyFiles]);

  const dataGapItems = useMemo(() => {
    const uploadedKeys = readyFiles.map(f => f.platform);
    return generateDataGaps(uploadedKeys, brandContext.model, manualActive, brandContext.namingConvention);
  }, [readyFiles, brandContext.model, manualActive, brandContext.namingConvention]);

  const effectiveBenchmark = useMemo(() => getEffectiveBenchmark(brandContext), [brandContext]);

  const handleLoadSample = useCallback(() => {
    const b2bContext: BrandContext = {
      brandName: "Artefact",
      model: "B2B",
      namingConvention: "[Market]_[Funnel]_[Objective]_[Audience]_[Creative]",
      demographics: "Enterprise decision makers, IT & Marketing directors, primary markets: FR, DE, UK, NL",
      selectedPlatforms: PLATFORM_OPTIONS.filter(p => p.available).map(p => p.key),
    };
    setBrandContext(b2bContext);
    setManualScores(generateSampleScores("B2B"));
    setUploadedFiles(generateSampleFiles());
    setShowSettings(false);
  }, []);

  // ─── Clear all data ───
  const handleClearAll = useCallback(() => {
    setManualScores({});
    setUploadedFiles([]);
    setBrandContext(DEFAULT_BRAND_CONTEXT);
    setSelectedPlatformId(null);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-corp border-b border-white/10">
        <div className="w-[90%] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <Link to="/" onClick={() => { setSelectedPlatformId(null); setShowSettings(false); }} className="flex items-center gap-5 hover:opacity-80 transition-opacity">
              <img src={artefactLogo} alt="Artefact" className="h-11 w-auto" />
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  Digital Maturity Accelerator
                </h1>
                <p className="text-sm text-white/60 mt-0.5">
                  Omnichannel Performance Audit — {platforms.length} Platforms
                </p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            {activeSourceFiles.length > 0 && (
              <div className="flex items-center gap-1.5">
                <FileSpreadsheet className="w-3.5 h-3.5 text-white/50" />
                <span className="text-xs text-white/60">{readyFiles.length} files</span>
              </div>
            )}
            {(() => {
              const uploadedPlatformCount = new Set(readyFiles.map(f => f.platform)).size;
              const totalPlatforms = platforms.length;
              const isPartial = uploadedPlatformCount > 0 && uploadedPlatformCount < totalPlatforms;
              return (
                <span className="text-xs px-3 py-1.5 rounded-md bg-white/20 text-white font-semibold tabular-nums">
                  {hasRealData ? `${liveMaturity}% Maturity` : "— Maturity"}
                  {isPartial && (
                    <span className="ml-1 text-white/60 font-normal">
                      ({uploadedPlatformCount}/{totalPlatforms})
                    </span>
                  )}
                </span>
              );
            })()}
            <div className="flex items-center gap-1 ml-1 border-l border-white/20 pl-3">
              {manualActive ? (
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30 hover:bg-amber-500/30 transition-colors active:scale-[0.97]"
                  title="Exit Demo Mode and clear all data"
                >
                  <XCircle size={14} />
                  Exit Demo
                </button>
              ) : (
                <button
                  onClick={handleLoadSample}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors active:scale-[0.97]"
                  title="Load Sample Data"
                >
                  <PlayCircle size={14} />
                  Demo
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors active:scale-[0.97]"
                title="Clear All Data"
              >
                <RotateCcw size={14} />
                Reset
              </button>
            </div>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors text-sm font-medium ${
                showSettings
                  ? "bg-white/20 text-white"
                  : "text-white/60 hover:text-white hover:bg-white/10"
              }`}
            >
              <Settings size={16} />
              Settings
            </button>
          </div>
        </div>
      </header>

      {showSettings ? (
        <main className="w-[90%] mx-auto px-6 py-5 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowSettings(false)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-sm font-medium
                           text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors active:scale-[0.97]"
              >
                <Home size={14} />
                Back
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearAll}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-sm font-semibold
                           hover:bg-destructive/10 transition-colors active:scale-[0.97]"
              >
                <Trash2 size={16} />
                Clear All Data
              </button>
              <button
                onClick={handleLoadSample}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold
                           hover:bg-primary/10 transition-colors active:scale-[0.97]"
              >
                <PlayCircle size={16} />
                Load Sample Data
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <BrandContextForm context={brandContext} onChange={setBrandContext} />
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Upload CSV/XLSX exports manually, or use the BigQuery connector on the main dashboard.
              </p>
              <FileUpload files={uploadedFiles} onFilesChange={setUploadedFiles} brandName={brandContext.brandName} namingConvention={brandContext.namingConvention} />
            </div>
          </div>
        </main>
      ) : (
        <>
          {/* Platform Tabs */}
          <div className="border-b border-border bg-card/50">
            <div className="w-[90%] mx-auto px-6">
              <div className="flex items-center gap-0.5 overflow-x-auto py-1.5 -mb-px scrollbar-none">
                <button
                  onClick={() => setSelectedPlatformId(null)}
                  className={`
                    group relative flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg
                    transition-all duration-200 whitespace-nowrap
                    ${selectedPlatformId === null
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }
                  `}
                >
                  <Home className="w-3.5 h-3.5" />
                  Overview
                  <span className={`tabular-nums text-xs font-bold ${selectedPlatformId === null ? "text-primary-foreground/80" : ""}`}>
                    {hasRealData ? `${liveMaturity}%` : "—"}
                  </span>
                </button>
                <div className="w-px h-5 bg-border mx-1 shrink-0" />
                {platforms.filter(p => brandContext.selectedPlatforms.includes(p.id as PlatformKey)).map(p => {
                  const hasData = hasDataForPlatform(p.id);
                  const hasPlatformManual = manualActive && getScoredCount(p, manualScores).scored > 0;
                  const platformHasReal = hasData || hasPlatformManual;
                  const liveScore = getPlatformLiveScore(p);
                  const isActive = selectedPlatformId === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPlatformId(p.id)}
                      className={`
                        group relative flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg
                        transition-all duration-200 whitespace-nowrap
                        ${isActive
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                        }
                      `}
                    >
                      <div className="flex items-center gap-1.5">
                        {hasData ? (
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-score-excellent" : "bg-score-good"}`} />
                        ) : (
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-muted-foreground" : "bg-border"}`} />
                        )}
                        {p.shortName}
                      </div>
                      <span className={`tabular-nums text-[11px] font-semibold ${
                        isActive ? "text-background/70" : !platformHasReal ? "text-muted-foreground/50" : liveScore >= 60 ? "text-score-good" : liveScore >= 40 ? "text-score-warning" : "text-score-poor"
                      }`}>
                        {platformHasReal ? `${liveScore}%` : "—"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <main className="w-[90%] mx-auto px-6 py-2 space-y-2">
            {/* Breadcrumb navigation */}
            {showSettings && (
              <div className="flex items-center gap-2 mb-4 text-sm">
                <button
                  onClick={() => { setSelectedPlatformId(null); setShowSettings(false); }}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Home className="w-3.5 h-3.5" />
                  Overview
                </button>
                <span className="text-muted-foreground/50">›</span>
                <span className="text-foreground font-medium">Settings</span>
              </div>
            )}
            {/* ── Review phases take over the full main area ── */}
            {apiAuditState?.status === "specialist_review" && auditId ? (
              <div className="py-2">
                <SpecialistReview
                  auditId={auditId}
                  results={apiAuditState.specialist_results}
                  onScoringStarted={async () => {
                    const poll = setInterval(async () => {
                      const s = await apiClient.getAudit(auditId);
                      setApiAuditState(s);
                      if (s.status === "scoring_review" || s.status === "failed") clearInterval(poll);
                    }, 3000);
                  }}
                />
              </div>
            ) : apiAuditState?.status === "scoring_review" && apiAuditState.scoring_output && auditId ? (
              <div className="py-2">
                <ScoringReview
                  auditId={auditId}
                  output={apiAuditState.scoring_output}
                  onComplete={(output) => {
                    setApiScoringOutput(output);
                    setApiAuditState(prev => prev ? { ...prev, status: "complete" } : prev);
                  }}
                />
              </div>
            ) : showMissingData ? (
              <MissingDataCard
                platformName={selectedPlatform?.shortName || selectedPlatformId || ""}
                platformId={selectedPlatformId!}
                onOpenSettings={() => setShowSettings(true)}
                onLoadSample={handleLoadSample}
                businessModel={brandContext.model}
              />
            ) : (
              <>
                {/* Executive Row */}
                {!selectedPlatformId ? (
                  /* ── OVERVIEW: 66% Radar | 33% Vertical Stack ── */
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {/* Left: Full-width Radar */}
                    <div className="bg-card rounded-xl p-4 shadow-sm border border-border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          Platform Maturity Radar
                        </span>
                        <div className="group relative">
                          <button className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
                            <Info className="w-3 h-3" />
                            Methodology
                          </button>
                          <div className="absolute top-full right-0 mt-1 w-64 p-3 rounded-lg bg-popover border border-border shadow-lg text-[10px] text-muted-foreground opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                            <p className="font-semibold text-foreground mb-1">Benchmark Methodology</p>
                            <p>Benchmarks are derived from Artefact's 2025 Digital Maturity Framework — the 'Golden Standard' for your business model.</p>
                            <p className="mt-1.5">Effective benchmark: <strong className="text-foreground">{effectiveBenchmark}%</strong>.</p>
                          </div>
                        </div>
                      </div>
                      {hasRealData ? (
                        <MastercardDashboard
                          platform={null}
                          uploadedPlatforms={readyFiles.map(f => f.platform)}
                          dashboardState={dashboardState}
                          getPlatformLiveScore={getPlatformLiveScore}
                          manualScores={manualScores}
                          allRows={allUploadedRows}
                          businessModel={brandContext.model}
                          compact
                          radarOnly
                          benchmarkScore={effectiveBenchmark}
                        />
                      ) : (
                        <div className="flex flex-col gap-4 py-2">
                          <p className="text-xs text-muted-foreground text-center">
                            Connect BigQuery to run an AI-powered audit, or upload CSV exports manually.
                          </p>
                          <AuditRunner
                            brandContext={{
                              brandName: brandContext.brandName,
                              model: (brandContext.model || "B2B") as "B2B" | "B2C" | "D2C",
                              namingConvention: brandContext.namingConvention,
                              markets: brandContext.markets ?? [],
                              selectedPlatforms: brandContext.selectedPlatforms ?? ["sea-google"],
                            }}
                            onSpecialistReady={(id, state) => {
                              setAuditId(id);
                              setApiAuditState(state);
                            }}
                          />
                          <button
                            onClick={() => setShowSettings(true)}
                            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors self-center"
                          >
                            Upload CSV / XLSX instead
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Right: Vertical Stack */}
                    <div className="flex flex-col gap-3">
                      {/* Maturity + Data Gaps row */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-card rounded-xl p-3 shadow-sm border border-border">
                          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            Omnichannel Maturity
                          </span>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={`tabular-nums font-mono text-3xl font-bold ${hasRealData ? `score-text-${(() => {
                              const s = liveMaturity;
                              return s >= 75 ? "excellent" : s >= 55 ? "good" : s >= 35 ? "warning" : s >= 20 ? "poor" : "critical";
                            })()}` : "text-muted-foreground/40"}`}>
                              {hasRealData ? `${liveMaturity}%` : "—"}
                            </span>
                            <div className="flex-1">
                              <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                {hasRealData && (
                                  <div
                                    className={`h-full rounded-full transition-all duration-700 ${
                                      liveMaturity >= 75 ? "bg-score-excellent" : liveMaturity >= 55 ? "bg-score-good" : liveMaturity >= 35 ? "bg-score-warning" : "bg-score-poor"
                                    }`}
                                    style={{ width: `${liveMaturity}%` }}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowGapsFlyout(true)}
                          disabled={!hasRealData}
                          className="bg-card rounded-xl p-3 shadow-sm border border-border text-left hover:border-primary/30 hover:bg-muted/30 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:hover:border-border disabled:hover:bg-card"
                        >
                          <span className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                            Data Gaps
                            <Info className="w-2.5 h-2.5 text-muted-foreground" />
                          </span>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={`tabular-nums font-mono text-3xl font-bold ${hasRealData ? "text-foreground" : "text-muted-foreground/40"}`}>
                              {hasRealData ? dataGapItems.length : "—"}
                            </span>
                            <span className="text-xs text-muted-foreground flex-1">
                              {!hasRealData ? "Upload data to detect gaps" : dataGapItems.length === 0 ? "All inputs covered" : "Click to review missing inputs"}
                            </span>
                          </div>
                        </button>
                      </div>

                      {/* Quick Wins */}
                      <div className="bg-card rounded-xl p-3 shadow-sm border border-border flex-1">
                        <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                          Top quick wins per channel
                        </span>
                        <div className="mt-2">
                          {hasRealData ? (
                            <StrategicWins
                              model={brandContext.model}
                              manualScores={manualScores}
                              selectedPlatformId={selectedPlatformId}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground py-4 text-center">
                              Upload data or load Demo to surface quick wins.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── PLATFORM VIEW: compact maturity bar header ── */
                  (() => {
                    const accent = getPlatformAccent(selectedPlatformId);
                    const platformHasReal = selectedPlatform
                      ? hasDataForPlatform(selectedPlatform.id) || (manualActive && getScoredCount(selectedPlatform, manualScores).scored > 0)
                      : false;
                    const pScore = selectedPlatform && platformHasReal ? getPlatformLiveScore(selectedPlatform) : 0;
                    const status = pScore >= 75 ? "excellent" : pScore >= 55 ? "good" : pScore >= 35 ? "warning" : pScore >= 20 ? "poor" : "critical";
                    return (
                      <div className={`bg-card rounded-xl px-4 py-2.5 shadow-sm border-2 ${accent.border} flex items-center gap-3`}>
                        <span className={`w-2 h-2 rounded-full shrink-0 ${accent.dot}`} />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground shrink-0">
                          {selectedPlatform?.shortName} Maturity
                        </span>
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          {platformHasReal && (
                            <div
                              className={`h-full rounded-full transition-all duration-700 bg-score-${status}`}
                              style={{ width: `${pScore}%` }}
                            />
                          )}
                        </div>
                        <span className={`tabular-nums font-mono text-base font-bold shrink-0 ${platformHasReal ? `score-text-${status}` : "text-muted-foreground/40"}`}>
                          {platformHasReal ? `${pScore}%` : "—"}
                        </span>
                        <span className={`text-[10px] font-medium shrink-0 ${accent.text} hidden sm:inline`}>
                          {accent.label}
                        </span>
                      </div>
                    );
                  })()
                )}
                {selectedPlatform && (() => {
                  const accent = getPlatformAccent(selectedPlatformId);
                  return (
                    <div className="grid grid-cols-1 lg:grid-cols-10 gap-4 items-stretch">
                      <div className="lg:col-span-7 min-w-0 flex">
                        <CollapsibleSection title="Category Breakdown" defaultOpen={true} className="w-full">
                          <CategoryBreakdown
                            platform={selectedPlatform}
                            manualScores={manualScores}
                            businessModel={brandContext.model}
                            dashboardState={dashboardState}
                            uploadedPlatforms={readyFiles.map(f => f.platform)}
                            onScoreChange={handleScoreChange}
                            injectedActions={currentInjectedActions}
                            allRows={allUploadedRows}
                          />
                        </CollapsibleSection>
                      </div>
                      <div className="lg:col-span-3 min-w-0 flex">
                        <CollapsibleSection title={`${selectedPlatform.shortName} Category Radar`} defaultOpen={true} className="w-full">
                          <div className={`rounded-lg border ${accent.border} p-3 h-full`}>
                            <MastercardDashboard
                              platform={selectedPlatform}
                              uploadedPlatforms={readyFiles.map(f => f.platform)}
                              dashboardState={dashboardState}
                              getPlatformLiveScore={getPlatformLiveScore}
                              manualScores={manualScores}
                              allRows={allUploadedRows}
                              businessModel={brandContext.model}
                              compact
                              radarOnly
                              benchmarkScore={effectiveBenchmark}
                            />
                          </div>
                        </CollapsibleSection>
                      </div>
                    </div>
                  );
                })()}
                {!selectedPlatformId && (
                  /* Overview: Platform Maturity Breakdown Grid */
                  <div>
                    <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Platform Maturity Breakdown
                    </h2>
                    <PlatformMaturityGrid
                      getPlatformLiveScore={getPlatformLiveScore}
                      manualScores={manualScores}
                      businessModel={brandContext.model}
                      onSelectPlatform={setSelectedPlatformId}
                      emptyState={!hasRealData}
                    />
                  </div>
                )}
                {/* Raw Data Preview — platform-specific */}
                {selectedPlatform && allUploadedRows.length > 0 && (() => {
                  const keys = platformKeyMap[selectedPlatformId!] || [];
                  const platformRows = allUploadedRows.filter(r => keys.includes(r.platform));
                  return platformRows.length > 0 ? (
                    <CollapsibleSection title="Raw Data Preview" defaultOpen={false}>
                      <RawDataPreview rows={platformRows} platformName={selectedPlatform.shortName} />
                    </CollapsibleSection>
                  ) : null;
                })()}
                <CollapsibleSection title="Validation Layer" defaultOpen={false}>
                  <ValidationLayer platform={selectedPlatform} />
                </CollapsibleSection>
              </>
            )}
          </main>
        </>
      )}
      <DataGapsFlyout open={showGapsFlyout} onOpenChange={setShowGapsFlyout} gaps={dataGapItems} />
    </div>
  );
}

function EmptyDataState({ title, description, onOpenSettings, onLoadSample }: {
  title: string; description: string; onOpenSettings: () => void; onLoadSample: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6 gap-3">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
        <Upload className="w-5 h-5 text-muted-foreground" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 transition-opacity active:scale-[0.97]"
        >
          <Upload className="w-3 h-3" />
          Upload data
        </button>
        <button
          onClick={onLoadSample}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors active:scale-[0.97]"
        >
          <PlayCircle className="w-3 h-3" />
          Load Demo
        </button>
      </div>
    </div>
  );
}


function MissingDataCard({ platformName, platformId, onOpenSettings, onLoadSample, businessModel }: {
  platformName: string; platformId: string; onOpenSettings: () => void;
  onLoadSample: () => void; businessModel: import("@/utils/brandContext").BusinessModel;
}) {
  const exportHint = platformExportGuide[platformId] || "Export campaign data as CSV or XLSX";
  const supportsApi = ["sea-google", "meta"].includes(platformId);

  return (
    <div className="max-w-3xl mx-auto opacity-0 animate-fade-up space-y-4" style={{ animationDelay: "100ms" }}>

      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-border flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-foreground">Get started with {platformName}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Upload your data, or load sample scores to explore the dashboard instantly.
            </p>
          </div>
        </div>
        <div className={`grid ${supportsApi ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"} divide-y md:divide-y-0 md:divide-x divide-border`}>
          <div className="px-6 py-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Upload className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-foreground">Upload File</h4>
                <p className="text-[11px] text-muted-foreground">CSV, XLSX, or Google Sheet</p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-md gradient-corp flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">1</span>
                <p className="text-xs text-muted-foreground">{exportHint}</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-md gradient-corp flex items-center justify-center text-white text-[10px] font-bold shrink-0 mt-0.5">2</span>
                <p className="text-xs text-muted-foreground">Upload in Settings — auto-detected & standardized</p>
              </div>
            </div>
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                         hover:opacity-90 transition-opacity active:scale-[0.97] w-full justify-center"
            >
              <Upload className="w-4 h-4" />
              Open Settings & Upload
            </button>
          </div>
          {supportsApi && (
            <div className="px-6 py-6 space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-accent/50 flex items-center justify-center">
                  <Zap className="w-4 h-4 text-accent-foreground" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Connect API</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {platformId === "sea-google" ? "Google Ads API" : "Meta Marketing API"}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-md bg-accent/30 flex items-center justify-center text-accent-foreground text-[10px] font-bold shrink-0 mt-0.5">1</span>
                  <p className="text-xs text-muted-foreground">
                    {platformId === "sea-google"
                      ? "Provide Developer Token, OAuth credentials & Customer ID"
                      : "Provide Meta App credentials & Access Token"}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-md bg-accent/30 flex items-center justify-center text-accent-foreground text-[10px] font-bold shrink-0 mt-0.5">2</span>
                  <p className="text-xs text-muted-foreground">Campaign data fetched automatically via API</p>
                </div>
              </div>
              <button
                disabled
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-semibold
                           text-muted-foreground w-full justify-center cursor-not-allowed opacity-60"
                title="Requires Lovable Cloud to be enabled"
              >
                <Zap className="w-4 h-4" />
                Coming Soon — Enable Cloud
              </button>
            </div>
          )}
        </div>

        {/* Load Sample Data */}
        <div className="px-6 py-4 border-t border-border bg-muted/20">
          <button
            onClick={onLoadSample}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold
                       hover:bg-primary/10 transition-colors active:scale-[0.97] w-full justify-center"
          >
            <PlayCircle className="w-4 h-4" />
            Load Sample Audit Data — Explore the Dashboard
          </button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Populates a realistic mix of Basic, Advanced & Champion scores so you can see the Spider Chart and Health Bars in action
          </p>
        </div>
      </div>
    </div>
  );
}

function BrandContextForm({ context, onChange }: {
  context: BrandContext;
  onChange: (ctx: BrandContext) => void;
}) {
  const update = (patch: Partial<BrandContext>) => onChange({ ...context, ...patch });

  return (
    <section className="opacity-0 animate-fade-up space-y-5" style={{ animationDelay: "200ms" }}>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Brand Context</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ground the audit with business context to calibrate pass/fail severity
        </p>
      </div>

      <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-5">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Brand Name</label>
          <input
            type="text"
            value={context.brandName}
            onChange={e => update({ brandName: e.target.value })}
            placeholder="e.g. Artefact"
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground
                       placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Business Model</label>
          <div className="flex gap-2">
            {(["B2B", "B2C", "D2C"] as const).map(opt => (
              <button
                key={opt}
                onClick={() => update({ model: context.model === opt ? "" : opt })}
                className={`px-4 py-2 text-sm font-semibold rounded-lg border-2 transition-all duration-150 active:scale-[0.97] ${
                  context.model === opt
                    ? "border-primary bg-primary text-primary-foreground shadow-md"
                    : "border-input bg-background text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/50"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Naming Convention</label>
          <textarea
            value={context.namingConvention}
            onChange={e => update({ namingConvention: e.target.value })}
            placeholder={"e.g. [Market]_[Funnel]_[Objective]_[Audience]_[Creative]\nFR_TOF_Prospecting_LAL_VID"}
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground
                       placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <p className="text-[10px] text-muted-foreground">
            Define your campaign naming structure — campaigns not matching will be flagged and reduce platform maturity by 15%
          </p>
          {(() => {
            const preview = getNamingGhostPreview(context.namingConvention);
            if (!preview) return null;
            return (
              <div className="mt-2 p-3 rounded-lg border border-border bg-muted/30 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Ghost Preview</p>
                <div className="flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 text-score-excellent shrink-0" />
                  <code className="text-xs text-score-excellent font-mono">{preview.perfect}</code>
                  <span className="text-[9px] text-muted-foreground">— Perfect</span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="w-3.5 h-3.5 text-score-poor shrink-0" />
                  <code className="text-xs text-score-poor font-mono">{preview.failing}</code>
                  <span className="text-[9px] text-muted-foreground">— Failing</span>
                </div>
              </div>
            );
          })()}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Audience Targeting Demographics</label>
          <textarea
            value={context.demographics}
            onChange={e => update({ demographics: e.target.value })}
            placeholder={"e.g. Women 25-54, interest in luxury fashion, primary markets: FR, NL, BE\nSecondary: DE, UK — enterprise decision makers for B2B"}
            rows={3}
            className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground
                       placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          <p className="text-[10px] text-muted-foreground">
            Define target segments so high-CPA in expansion markets is flagged with less severity
          </p>
        </div>

        {/* Platform Selection — drives which tabs appear in the dashboard */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">Platform Selection</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PLATFORM_OPTIONS.map(opt => {
              const checked = context.selectedPlatforms.includes(opt.key);
              const disabled = !opt.available;
              return (
                <button
                  key={opt.key}
                  disabled={disabled}
                  onClick={() => {
                    const next = checked
                      ? context.selectedPlatforms.filter(k => k !== opt.key)
                      : [...context.selectedPlatforms, opt.key];
                    update({ selectedPlatforms: next });
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border-2 transition-all duration-150 active:scale-[0.97] text-left ${
                    disabled
                      ? "border-dashed border-input bg-muted/30 text-muted-foreground/60 cursor-not-allowed"
                      : checked
                      ? "border-primary bg-primary text-primary-foreground shadow-md"
                      : "border-input bg-background text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-muted/50"
                  }`}
                >
                  <span className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center shrink-0 ${
                    checked && !disabled ? "border-primary-foreground bg-primary-foreground/20" : "border-current"
                  }`}>
                    {checked && !disabled && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span className="flex-1">{opt.label}</span>
                  {disabled && <span className="text-[8px] uppercase tracking-wider opacity-60">Soon</span>}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Only checked platforms appear as tabs next to Overview. Reddit support is coming soon.
          </p>
        </div>
      </div>
    </section>
  );
}

function CollapsibleSection({ title, defaultOpen = true, children, className = "" }: {
  title: string; defaultOpen?: boolean; children: React.ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col ${className}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/30 transition-colors active:scale-[0.995]"
      >
        <h2 className="text-xs font-semibold text-foreground">{title}</h2>
        <ChevronDown
          className={`w-3.5 h-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}
