import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Globe, PlayCircle, XCircle } from "lucide-react";
import artefactLogo from "@/assets/artefact-logo-white.png";
import SeoAuditRunner from "@/components/SeoAuditRunner";
import SeoResults from "@/components/SeoResults";
import SpecialistReview from "@/components/SpecialistReview";
import ScoringReview from "@/components/ScoringReview";
import { seoMaturityText } from "@/utils/seo";
import { apiClient, type AuditState, type ScoringOutput } from "@/lib/apiClient";
import { DEFAULT_BRAND_CONTEXT, getEffectiveBenchmark } from "@/utils/brandContext";
import { saveSeoSummary } from "@/utils/seoSummary";
import { auditWorkbook, downloadWorkbook, topicWorkbook } from "@/utils/seoExport";
import { SEO_CATEGORY_TOPIC_COUNT, SEO_PLATFORM_ID, SEO_PLATFORM_LABEL, SEO_TIERS } from "@/data/seoPulse";
import { SEO_DEMO_BRAND_CONTEXT, SEO_DEMO_DOMAIN, SEO_DEMO_RESULTS, SEO_DEMO_SCORING } from "@/data/seoDemo";

const TOPIC_COUNT = Object.values(SEO_CATEGORY_TOPIC_COUNT).reduce((a, b) => a + b, 0);

/**
 * SEO & AI Search tab: audit runner and review steps, kept apart from the paid media overview. Uses the
 * same backend audit flow with platform "seo". There is no brand context form: the backend builds the
 * brand context from the SEO pulse the audit runs on (the n8n form), and the results read it from the audit.
 */
export default function SeoAudit() {
  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditState, setAuditState] = useState<AuditState | null>(null);
  const [finalOutput, setFinalOutput] = useState<ScoringOutput | null>(null);
  // Demo: a sample audit that runs entirely in the browser (no backend), e.g. for Lovable
  const [demoMode, setDemoMode] = useState(false);
  // Excel export running: a topic, "all", or null; and the last export error
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Client and site of the audit: from the pulse, filled in by the backend
  const brandName = auditState?.brand_context.brandName ?? "";
  const siteUrl = auditState?.brand_context.seo?.siteUrl ?? "";

  const resetAudit = () => {
    setAuditId(null);
    setAuditState(null);
    setFinalOutput(null);
    setDemoMode(false);
    setExportError(null);
  };

  const loadDemo = () => {
    const now = new Date().toISOString();
    setFinalOutput(null);
    setDemoMode(true);
    setAuditId("demo");
    setAuditState({
      audit_id: "demo",
      brand_context: {
        brandName: SEO_DEMO_BRAND_CONTEXT.brandName,
        model: SEO_DEMO_BRAND_CONTEXT.model as "B2B" | "B2C" | "D2C",
        namingConvention: "",
        demographics: "",
        markets: [],
        selectedPlatforms: [SEO_PLATFORM_ID],
        industry: SEO_DEMO_BRAND_CONTEXT.industry ?? "",
        seo: SEO_DEMO_BRAND_CONTEXT.seo,
      },
      status: "specialist_review",
      specialist_results: SEO_DEMO_RESULTS,
      scoring_output: SEO_DEMO_SCORING,
      error: null,
      created_at: now,
      updated_at: now,
    });
  };

  const benchmark = getEffectiveBenchmark(DEFAULT_BRAND_CONTEXT);

  // Excel export of one criterion (topic) or the whole audit, from the crawl and n8n run the audit read. Not in the demo
  // (no backend) and not for an audit started before the backend kept its sources.
  const seoSources = !demoMode ? auditState?.seo ?? null : null;
  const exportSeo = async (topic?: string) => {
    if (!seoSources || !auditState) return;
    setExporting(topic ?? "all");
    setExportError(null);
    try {
      const data = await apiClient.getSeoExport(seoSources, topic ?? "", topic ? 50000 : 10000);
      const meta = { brandName, site: data.site };
      const day = new Date().toISOString().slice(0, 10);
      const results = auditState.specialist_results;
      if (topic) downloadWorkbook(topicWorkbook(topic, results.find(r => r.topic === topic), data, meta),
                                  `SEO ${topic} - ${brandName || data.site} ${day}.xlsx`);
      else downloadWorkbook(auditWorkbook(results, data, meta), `SEO audit - ${brandName || data.site} ${day}.xlsx`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  };

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
        {exportError && (
          <div className="rounded-lg border border-score-poor/40 bg-score-poor/10 px-4 py-2 text-xs">
            <span className="font-semibold">Export failed</span> — {exportError}
          </div>
        )}
        {auditState?.status === "specialist_review" && auditId ? (
          <SpecialistReview
            auditId={auditId}
            results={auditState.specialist_results}
            skipValidation={demoMode || !!auditState.scoring_output}
            platformId={SEO_PLATFORM_ID}
            onExport={seoSources ? exportSeo : undefined}
            exporting={exporting}
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
                brandName,
                domain: siteUrl,
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
            brandName={brandName}
            benchmarkScore={benchmark}
            onNewAudit={resetAudit}
            onExport={seoSources ? () => exportSeo() : undefined}
            exporting={exporting === "all"}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: the site and pulse to audit; right: what the tiers mean */}
            <SeoAuditRunner
              onSpecialistReady={(id, state) => {
                setAuditId(id);
                setAuditState(state);
              }}
            />
            <div className="flex flex-col gap-4">
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
