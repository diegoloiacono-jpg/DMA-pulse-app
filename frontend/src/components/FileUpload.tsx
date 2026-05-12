import { useState, useCallback } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { detectPlatform, bridgeRows, virtualJoin, type UnifiedRow } from "@/lib/metricBridge";
import { Upload, FileSpreadsheet, X, CheckCircle2, AlertTriangle, Link2, ArrowRight, Globe } from "lucide-react";
import PlatformDataGuide from "./PlatformDataGuide";
import DiagnosticChecklist from "./DiagnosticChecklist";
import ColumnMapper from "./ColumnMapper";
import { autoMapColumns, sanitizeNumericValue, type ColumnMapping, type FieldKey } from "@/utils/dataProcessor";

export interface UploadedFile {
  id: string;
  name: string;
  platform: string;
  rows: number;
  columns: string[];
  status: "processing" | "ready" | "error";
  error?: string;
  data: UnifiedRow[];
}

interface FileUploadProps {
  files: UploadedFile[];
  onFilesChange: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
  brandName?: string;
  namingConvention?: string;
}

interface PendingFile {
  id: string;
  name: string;
  headers: string[];
  rawRows: Record<string, string>[];
  platform: string;
}

export default function FileUpload({ files, onFilesChange, brandName = "", namingConvention = "" }: FileUploadProps) {
  const [uploadMode, setUploadMode] = useState<"local" | "gsheet">("local");
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetLoading, setSheetLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [joinResult, setJoinResult] = useState<ReturnType<typeof virtualJoin> | null>(null);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);

  const processFile = useCallback(async (file: File) => {
    const id = `${file.name}-${Date.now()}`;

    try {
      let rawRows: Record<string, string>[] = [];
      let headers: string[] = [];

      if (file.name.endsWith(".csv") || file.name.endsWith(".tsv")) {
        const text = await file.text();
        const result = Papa.parse<Record<string, string>>(text, {
          header: true,
          skipEmptyLines: true,
          dynamicTyping: false,
        });
        rawRows = result.data;
        headers = result.meta.fields || [];
      } else if (file.name.match(/\.xlsx?$/i)) {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, string>>(firstSheet, { defval: "" });
        rawRows = jsonData.map(row => {
          const mapped: Record<string, string> = {};
          for (const [k, v] of Object.entries(row)) {
            mapped[k] = String(v);
          }
          return mapped;
        });
        if (rawRows.length > 0) headers = Object.keys(rawRows[0]);
      } else {
        throw new Error("Unsupported file format. Use CSV, TSV, or XLSX.");
      }

      const platform = detectPlatform(headers);

      // Show the column mapper modal instead of processing directly
      setPendingFile({ id, name: file.name, headers, rawRows, platform });

    } catch (err) {
      const errorId = `${file.name}-${Date.now()}`;
      onFilesChange(prev => [...prev, {
        id: errorId, name: file.name, platform: "unknown", rows: 0, columns: [],
        status: "error" as const, error: err instanceof Error ? err.message : "Parse failed", data: [],
      }]);
    }
  }, []);

  /** Process file with confirmed mapping */
  const processMappedFile = useCallback((mapping: ColumnMapping) => {
    if (!pendingFile) return;

    const { id, name, headers, rawRows, platform } = pendingFile;

    // Apply custom mapping: remap raw rows using the user's column choices
    const remappedRows = rawRows.map(row => {
      const remapped: Record<string, string> = {};
      for (const [field, col] of Object.entries(mapping)) {
        if (col) {
          remapped[field] = row[col] || "";
        }
      }
      // Also keep original columns for the bridge
      for (const [k, v] of Object.entries(row)) {
        if (!(k in remapped)) remapped[k] = v;
      }
      return remapped;
    });

    const unified = bridgeRows(remappedRows, platform, name);

    onFilesChange(prev => [...prev, {
      id, name, platform, rows: rawRows.length, columns: headers,
      status: "ready" as const, data: unified,
    }]);

    setPendingFile(null);
  }, [pendingFile, onFilesChange]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      droppedFiles.forEach(processFile);
    },
    [processFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (selected) Array.from(selected).forEach(processFile);
      e.target.value = "";
    },
    [processFile]
  );

  const removeFile = (id: string) => {
    onFilesChange(prev => prev.filter(f => f.id !== id));
    setJoinResult(null);
  };

  const runVirtualJoin = () => {
    const allData = files.filter(f => f.status === "ready").flatMap(f => f.data);
    if (allData.length > 0) {
      const result = virtualJoin(allData);
      setJoinResult(result);
    }
  };

  const fetchGoogleSheet = useCallback(async () => {
    if (!sheetUrl.trim()) return;
    setSheetLoading(true);
    try {
      const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) throw new Error("Invalid Google Sheets URL");
      const sheetId = match[1];
      const csvUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
      const resp = await fetch(csvUrl);
      if (!resp.ok) throw new Error("Could not fetch sheet. Make sure it's publicly accessible (Anyone with link → Viewer).");
      const text = await resp.text();
      const result = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
      const headers = result.meta.fields || [];
      const platform = detectPlatform(headers);
      const id = `gsheet-${Date.now()}`;

      // Show mapper modal for Google Sheets too
      setPendingFile({ id, name: `Google Sheet (${sheetId.slice(0, 8)}…)`, headers, rawRows: result.data, platform });
      setSheetUrl("");
    } catch (err) {
      onFilesChange(prev => [...prev, {
        id: `gsheet-err-${Date.now()}`, name: sheetUrl.slice(0, 40), platform: "unknown",
        rows: 0, columns: [], status: "error" as const,
        error: err instanceof Error ? err.message : "Failed to fetch", data: [],
      }]);
    } finally {
      setSheetLoading(false);
    }
  }, [sheetUrl, onFilesChange]);

  const readyFiles = files.filter(f => f.status === "ready");
  const platformNames: Record<string, string> = {
    meta: "Meta Ads",
    google: "Google Ads",
    linkedin: "LinkedIn",
    tiktok: "TikTok",
    bing: "Bing Ads",
    pinterest: "Pinterest",
    snapchat: "Snapchat",
    unknown: "Unknown Platform",
  };

  return (
    <section className="opacity-0 animate-fade-up space-y-5" style={{ animationDelay: "150ms" }}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Data Ingestion</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Upload campaign exports — the Metric Bridge auto-standardizes across platforms
          </p>
        </div>
        {readyFiles.length >= 1 && (
          <button
            onClick={runVirtualJoin}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                       hover:opacity-90 transition-opacity active:scale-[0.97]"
          >
            <Link2 className="w-4 h-4" />
            Run Virtual Join
          </button>
        )}
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setUploadMode("local")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors active:scale-[0.97] ${
            uploadMode === "local"
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Upload className="w-4 h-4" />
          Local File
        </button>
        <button
          onClick={() => setUploadMode("gsheet")}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-colors active:scale-[0.97] ${
            uploadMode === "gsheet"
              ? "border-primary bg-primary/10 text-primary"
              : "border-input text-muted-foreground hover:text-foreground hover:bg-muted/50"
          }`}
        >
          <Globe className="w-4 h-4" />
          Google Sheet
        </button>
      </div>

      {uploadMode === "local" ? (
        /* Drop Zone */
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`
            relative rounded-xl border-2 border-dashed transition-all duration-200
            flex flex-col items-center justify-center py-10 px-6 text-center cursor-pointer
            ${isDragging
              ? "border-primary bg-primary/5 scale-[1.01]"
              : "border-border hover:border-muted-foreground/40 bg-card"
            }
          `}
          onClick={() => document.getElementById("file-upload-input")?.click()}
        >
          <input
            id="file-upload-input"
            type="file"
            multiple
            accept=".csv,.tsv,.xlsx,.xls"
            className="hidden"
            onChange={handleFileInput}
          />
          <div className="w-12 h-12 rounded-xl gradient-corp flex items-center justify-center mb-4">
            <Upload className="w-5 h-5 text-white" />
          </div>
          <p className="text-sm font-medium text-foreground">
            Drop campaign exports here
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-md">
            CSV, TSV, or XLSX files from Meta, Google, LinkedIn, TikTok, Pinterest, Snapchat, or Bing.
          </p>
        </div>
      ) : (
        /* Google Sheet URL */
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl gradient-corp flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Import from Google Sheets</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Paste a Google Sheet link. The sheet must be shared as "Anyone with the link → Viewer".
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={sheetUrl}
              onChange={e => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground
                         placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={e => e.key === "Enter" && fetchGoogleSheet()}
            />
            <button
              onClick={fetchGoogleSheet}
              disabled={!sheetUrl.trim() || sheetLoading}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                         hover:opacity-90 transition-opacity active:scale-[0.97] disabled:opacity-50"
            >
              {sheetLoading ? "Fetching…" : "Import"}
            </button>
          </div>
        </div>
      )}

      {/* Uploaded Files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-4 px-4 py-3 bg-card rounded-xl border border-border shadow-sm"
            >
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                file.status === "ready" ? "bg-score-excellent/10" :
                file.status === "error" ? "bg-score-poor/10" :
                "bg-muted"
              }`}>
                {file.status === "ready" && <FileSpreadsheet className="w-4 h-4 text-score-excellent" />}
                {file.status === "error" && <AlertTriangle className="w-4 h-4 text-score-poor" />}
                {file.status === "processing" && (
                  <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">{file.name}</span>
                  {file.status === "ready" && (
                    <span className="text-xs px-2 py-0.5 rounded-md bg-secondary/10 text-secondary font-semibold shrink-0">
                      {platformNames[file.platform] || file.platform}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {file.status === "processing" && "Parsing & detecting platform..."}
                  {file.status === "ready" && `${file.rows.toLocaleString()} rows · ${file.columns.length} columns · ${file.data.length} unified records`}
                  {file.status === "error" && <span className="text-score-poor">{file.error}</span>}
                </p>
              </div>

              <button
                onClick={() => removeFile(file.id)}
                className="p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Virtual Join Results */}
      {joinResult && (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-border gradient-corp">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-white" />
              <h3 className="text-sm font-semibold text-white">Virtual Join Complete</h3>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border">
            <JoinStat label="Campaigns Linked" value={joinResult.joinStats.campaignCount.toLocaleString()} />
            <JoinStat label="Source Files" value={joinResult.joinStats.fileCount.toString()} />
            <JoinStat label="Geo Segments" value={joinResult.joinStats.geoSegments.toLocaleString()} />
            <JoinStat label="Cross-File Link Rate" value={`${joinResult.joinStats.linkRate}%`} />
          </div>

          {/* Metric Bridge Summary */}
          <div className="px-5 py-4 border-t border-border">
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Metric Bridge Standardization
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <BridgeMapping from='Meta "Result Rate" / Google "Interaction Rate" / LinkedIn "Engagement Rate"' to="Engagement Index" />
              <BridgeMapping from='Meta "Cost per Result" / Google "Cost / Conv." / LinkedIn "Cost per Lead"' to="Cost per Result" />
              <BridgeMapping from='Meta "Purchase ROAS" / Google "Conv. Value / Cost" / TikTok "Total Complete Payment ROAS"' to="Return on Spend" />
              <BridgeMapping from='All platforms "CTR" variants / Snapchat "Swipe Up Rate"' to="Click-Through Rate" />
            </div>
          </div>

          {/* Google Join confirmation */}
          {joinResult.joinStats.geoSegments > 0 && (
            <div className="px-5 py-3 border-t border-border bg-score-excellent/5 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-score-excellent mt-0.5 shrink-0" />
              <p className="text-xs text-foreground">
                <strong>Google Join:</strong> Successfully mapped {joinResult.joinStats.campaignCount} Campaign Budgets
                to {joinResult.joinStats.geoSegments} Geographic segments.
              </p>
            </div>
          )}

          {/* Top campaigns preview */}
          {joinResult.joined.length > 0 && (
            <div className="border-t border-border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Campaign</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-muted-foreground">Platform</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Spend</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">Eng. Index</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">CPR</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-muted-foreground">ROAS</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {joinResult.joined.slice(0, 15).map((row, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-4 text-xs text-foreground font-medium truncate max-w-[200px]">{row.campaignName}</td>
                      <td className="py-2.5 px-3 text-xs">
                        <span className="px-2 py-0.5 rounded bg-secondary/10 text-secondary font-semibold">
                          {platformNames[row.platform] || row.platform}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-xs tabular-nums text-right text-foreground">
                        ${row.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-2.5 px-3 text-xs tabular-nums text-right text-foreground">
                        {row.engagementIndex.toFixed(2)}%
                      </td>
                      <td className="py-2.5 px-3 text-xs tabular-nums text-right text-foreground">
                        ${row.costPerResult.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-xs tabular-nums text-right text-foreground">
                        {row.returnOnSpend.toFixed(2)}x
                      </td>
                      <td className="py-2.5 px-4 text-xs text-muted-foreground font-mono truncate max-w-[160px]">
                        {row.sourceFile}:{row.sourceRow}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {joinResult.joined.length > 15 && (
                <p className="text-xs text-muted-foreground px-5 py-2.5 border-t border-border">
                  Showing 15 of {joinResult.joined.length.toLocaleString()} unified rows
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Required Metrics & Dimensions Guide */}
      {files.length === 0 && !pendingFile && <PlatformDataGuide />}

      {/* Diagnostic Checklist — shown when a file is pending */}
      {pendingFile && (
        <>
          <DiagnosticChecklist
            headers={pendingFile.headers}
            platformId={pendingFile.platform}
            namingConvention={namingConvention}
            sampleCampaignNames={pendingFile.rawRows.slice(0, 50).map(r => {
              const nameCol = pendingFile.headers.find(h =>
                ["campaign", "campaign name", "campaign_name"].includes(h.toLowerCase().trim())
              );
              return nameCol ? r[nameCol] || "" : "";
            }).filter(Boolean)}
            onProceed={() => {
              // Auto-map and proceed
              const mapping = autoMapColumns(pendingFile.headers);
              processMappedFile(mapping);
            }}
          />
          <ColumnMapper
            headers={pendingFile.headers}
            sampleRows={pendingFile.rawRows.slice(0, 5)}
            platform={pendingFile.platform}
            brandName={brandName}
            onConfirm={processMappedFile}
            onCancel={() => setPendingFile(null)}
          />
        </>
      )}
    </section>
  );
}

function JoinStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="tabular-nums font-mono text-xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}

function BridgeMapping({ from, to }: { from: string; to: string }) {
  return (
    <div className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg bg-muted/40">
      <ArrowRight className="w-3 h-3 mt-0.5 text-primary shrink-0" />
      <div>
        <span className="text-muted-foreground">{from}</span>
        <span className="text-foreground font-semibold ml-1">→ {to}</span>
      </div>
    </div>
  );
}

export { default as PlatformDataGuide } from "./PlatformDataGuide";
