import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Search, Globe, PlayCircle, XCircle } from "lucide-react";
import artefactLogo from "@/assets/artefact-logo-white.png";
import SeoAuditRunner from "@/components/SeoAuditRunner";
import SeoContextFields from "@/components/SeoContextFields";
import SeoResults from "@/components/SeoResults";
import SpecialistReview from "@/components/SpecialistReview";
import ScoringReview from "@/components/ScoringReview";
import { DEFAULT_SEO_CONTEXT, seoMaturityText } from "@/utils/seo";
import { apiClient, type AuditState, type BrandContextPayload, type ScoringOutput } from "@/lib/apiClient";
import { type BrandContext, DEFAULT_BRAND_CONTEXT, getEffectiveBenchmark } from "@/utils/brandContext";
import { listSavedContexts, fetchContexts, saveContext, type SavedContext } from "@/utils/savedContexts";
import { saveSeoSummary } from "@/utils/seoSummary";
import { SEO_CATEGORY_TOPIC_COUNT, SEO_PLATFORM_ID, SEO_PLATFORM_LABEL, SEO_TIERS } from "@/data/seoPulse";
import { SEO_DEMO_BRAND_CONTEXT, SEO_DEMO_DOMAIN, SEO_DEMO_RESULTS, SEO_DEMO_SCORING } from "@/data/seoDemo";

const INPUT =
  "w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";

const TOPIC_COUNT = Object.values(SEO_CATEGORY_TOPIC_COUNT).reduce((a, b) => a + b, 0);

/**
 * SEO & AI Search tab: its own brand context, audit runner and review steps, kept apart from the
 * paid media overview. Uses the same backend audit flow with platform "seo".
 */
export default function SeoAudit() {
  const [brandContext, setBrandContext] = useState<BrandContext>(DEFAULT_BRAND_CONTEXT);
  const [savedContexts, setSavedContexts] = useState<SavedContext[]>(() => listSavedContexts());
  const [editingContextId, setEditingContextId] = useState<string | null>(null);
  const [contextStoreError, setContextStoreError] = useState("");
  const [contextSaved, setContextSaved] = useState(false);

  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditState, setAuditState] = useState<AuditState | null>(null);
  const [finalOutput, setFinalOutput] = useState<ScoringOutput | null>(null);
  // Demo: a sample audit that runs entirely in the browser (no backend), e.g. for Lovable
  const [demoMode, setDemoMode] = useState(false);

  const refreshContexts = useCallback(async () => {
    try {
      setSavedContexts(await fetchContexts());
      setContextStoreError("");
    } catch (err) {
      setContextStoreError(err instanceof Error ? err.message : "Could not reach the saved-context store.");
    }
  }, []);

  useEffect(() => {
    void refreshContexts();
  }, [refreshContexts]);

  const handleSelectContext = useCallback((id: string | null) => {
    if (!id) { setEditingContextId(null); return; }
    const entry = savedContexts.find(s => s.id === id);
    if (entry) {
      setBrandContext(entry.context);
      setEditingContextId(id);
    }
  }, [savedContexts]);

  const seo = brandContext.seo ?? DEFAULT_SEO_CONTEXT;

  const payload: BrandContextPayload = {
    brandName: brandContext.brandName,
    model: (brandContext.model || "B2B") as "B2B" | "B2C" | "D2C",
    namingConvention: "",
    demographics: "",
    markets: [],
    selectedPlatforms: [SEO_PLATFORM_ID],
    industry: brandContext.industry ?? "",
    // Only send SEO fields that were filled in or saved; without them the agent treats them as unknown
    seo: brandContext.seo,
  };

  const resetAudit = () => {
    setAuditId(null);
    setAuditState(null);
    setFinalOutput(null);
    if (demoMode) {
      setDemoMode(false);
      setBrandContext(DEFAULT_BRAND_CONTEXT);
    }
  };

  const loadDemo = () => {
    const now = new Date().toISOString();
    setBrandContext(SEO_DEMO_BRAND_CONTEXT);
    setEditingContextId(null);
    setFinalOutput(null);
    setDemoMode(true);
    setAuditId("demo");
    setAuditState({
      audit_id: "demo",
      brand_context: { ...payload, brandName: SEO_DEMO_BRAND_CONTEXT.brandName, seo: SEO_DEMO_BRAND_CONTEXT.seo },
      status: "specialist_review",
      specialist_results: SEO_DEMO_RESULTS,
      scoring_output: SEO_DEMO_SCORING,
      error: null,
      created_at: now,
      updated_at: now,
    });
  };

  const benchmark = getEffectiveBenchmark(brandContext);

  return (
    <div className="min-h-screen bg-background">
      <header className="gradient-corp border-b border-white/10">
        <div className="w-[90%] mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-5 hover:opacity-80 transition-opacity">
            <img src={artefactLogo} alt="Artefact" className="h-11 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Digital Maturity Accelerator</h1>
              <p className="text-sm text-white/60 mt-0.5">{SEO_PLATFORM_LABEL} Audit — {TOPIC_COUNT} criteria</p>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            {demoMode ? (
              <button
                onClick={resetAudit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-500/20 text-amber-200 border border-amber-400/30 hover:bg-amber-500/30 transition-colors active:scale-[0.97]"
                title="Leave the demo audit"
              >
                <XCircle size={14} />
                Exit Demo
              </button>
            ) : (
              <button
                onClick={loadDemo}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors active:scale-[0.97]"
                title="Load a sample SEO audit (no backend needed)"
              >
                <PlayCircle size={14} />
                Demo
              </button>
            )}
            <span className="w-px h-5 bg-white/20 mx-1" />
            <Link
              to="/"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Search size={14} />
              Paid media
            </Link>
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-white/20 text-white">
              <Globe size={14} />
              SEO
            </span>
          </nav>
        </div>
      </header>

      <main className="w-[90%] mx-auto px-6 py-4 space-y-4">
        {demoMode && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-2 text-xs text-foreground">
            <span className="font-semibold">Demo audit</span> — sample data for {SEO_DEMO_DOMAIN}, made with the SEO
            pipeline on generated metrics. Not a real client; changes in the reviews are not saved.
          </div>
        )}
        {auditState?.status === "specialist_review" && auditId ? (
          <SpecialistReview
            auditId={auditId}
            results={auditState.specialist_results}
            skipValidation={demoMode || !!auditState.scoring_output}
            platformId={SEO_PLATFORM_ID}
            onScoringStarted={() => {
              if (auditState.scoring_output) {
                setAuditState(prev => prev ? { ...prev, status: "scoring_review" } : prev);
                return;
              }
              const poll = setInterval(async () => {
                const s = await apiClient.getAudit(auditId);
                setAuditState(s);
                if (s.status === "scoring_review" || s.status === "failed") clearInterval(poll);
              }, 3000);
            }}
          />
        ) : auditState?.status === "scoring_review" && auditState.scoring_output && auditId ? (
          <ScoringReview
            auditId={auditId}
            output={auditState.scoring_output}
            specialistResults={auditState.specialist_results}
            benchmarkScore={benchmark}
            onComplete={(output) => {
              setFinalOutput(output);
              setAuditState(prev => prev ? { ...prev, status: "complete" } : prev);
              saveSeoSummary({
                brandName: brandContext.brandName,
                domain: seo.siteUrl,
                platformScore: Math.round(output.platform_score),
                maturityText: seoMaturityText(output.maturity, output.maturity_label),
                topWin: output.quick_wins[0]?.topic ?? null,
                completedAt: new Date().toISOString(),
              });
            }}
            onBack={() => setAuditState(prev => prev ? { ...prev, status: "specialist_review" } : prev)}
            skipValidation={demoMode}
          />
        ) : auditState?.status === "complete" && finalOutput ? (
          <SeoResults
            output={finalOutput}
            specialistResults={auditState.specialist_results}
            brandName={brandContext.brandName}
            benchmarkScore={benchmark}
            onNewAudit={resetAudit}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: SEO brand context */}
            <div className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
              <div>
                <h3 className="text-sm font-semibold">Brand Context</h3>
                <p className="text-xs text-muted-foreground mt-0.5">SEO & AI Search — configure before running the audit</p>
              </div>

              {savedContexts.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">Load saved context</label>
                  <select
                    value={editingContextId ?? ""}
                    onChange={e => handleSelectContext(e.target.value || null)}
                    className={INPUT}
                  >
                    <option value="">— New / current form —</option>
                    {savedContexts.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Brand Name</label>
                <input
                  type="text"
                  value={brandContext.brandName}
                  onChange={e => setBrandContext(c => ({ ...c, brandName: e.target.value }))}
                  placeholder="e.g. Artefact"
                  className={INPUT}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Business Model</label>
                <div className="flex gap-2">
                  {(["B2B", "B2C", "D2C"] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setBrandContext(c => ({ ...c, model: c.model === opt ? "" : opt }))}
                      className={`px-4 py-2 text-sm font-semibold rounded-lg border-2 transition-all duration-150 active:scale-[0.97] ${
                        brandContext.model === opt
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
                <label className="text-xs font-medium text-foreground">Industry</label>
                <input
                  type="text"
                  value={brandContext.industry ?? ""}
                  onChange={e => setBrandContext(c => ({ ...c, industry: e.target.value }))}
                  placeholder="e.g. Finance, Retail, Insurance, Travel"
                  className={INPUT}
                />
              </div>

              <SeoContextFields
                value={seo}
                onChange={next => setBrandContext(c => ({ ...c, seo: next }))}
              />

              {contextStoreError && <p className="text-xs text-destructive">{contextStoreError}</p>}

              <button
                onClick={async () => {
                  try {
                    // Keeps the paid media fields of the context; only the shared and SEO fields are edited here
                    const entry = await saveContext(brandContext.brandName || "Unnamed", brandContext, editingContextId ?? undefined);
                    setEditingContextId(entry.id);
                    await refreshContexts();
                    setContextSaved(true);
                    setTimeout(() => setContextSaved(false), 2000);
                  } catch (err) {
                    setContextStoreError(err instanceof Error ? err.message : "Save failed.");
                  }
                }}
                disabled={!brandContext.brandName.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-primary/30 bg-primary/5 text-primary text-sm font-semibold hover:bg-primary/10 transition-colors active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {contextSaved ? (<><Check className="w-4 h-4" />Saved</>) : "Save Context"}
              </button>
            </div>

            {/* Right: runner + what the tiers mean */}
            <div className="flex flex-col gap-4">
              <SeoAuditRunner
                brandContext={payload}
                savedContexts={savedContexts}
                activeContextId={editingContextId}
                onSelectContext={handleSelectContext}
                onSpecialistReady={(id, state) => {
                  setAuditId(id);
                  setAuditState(state);
                }}
              />
              <div className="p-4 rounded-xl border bg-card space-y-2">
                <span className="text-sm font-semibold">Maturity tiers</span>
                <p className="text-xs text-muted-foreground">
                  Every criterion has a fixed tier. The site reaches a tier when enough of its criteria pass
                  and every lower tier is reached.
                </p>
                <ul className="space-y-1.5">
                  {SEO_TIERS.map(t => (
                    <li key={t.name} className="text-xs">
                      <span className="font-semibold">{t.name}</span>
                      <span className="text-muted-foreground"> — {t.definition}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
