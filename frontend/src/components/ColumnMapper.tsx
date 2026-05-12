import { useState, useMemo } from "react";
import { ArrowRight, Check, AlertTriangle, Columns, Wand2, Save } from "lucide-react";
import {
  autoMapColumns,
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  type ColumnMapping,
  type FieldKey,
  validateNumericColumn,
  saveMappingMemory,
  loadMappingMemory,
} from "@/utils/dataProcessor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  headers: string[];
  sampleRows: Record<string, string>[];
  platform: string;
  brandName: string;
  onConfirm: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}

const NUMERIC_FIELDS: FieldKey[] = ["spend", "impressions", "clicks", "conversions", "revenue", "dailyBudget"];

export default function ColumnMapper({ headers, sampleRows, platform, brandName, onConfirm, onCancel }: Props) {
  // Try to load saved mapping first, then auto-detect
  const initialMapping = useMemo(() => {
    const saved = loadMappingMemory(brandName, platform);
    if (saved) {
      // Verify saved columns still exist in current headers
      const valid = Object.entries(saved).every(
        ([, col]) => col === null || headers.includes(col as string)
      );
      if (valid) return saved;
    }
    return autoMapColumns(headers);
  }, [headers, brandName, platform]);

  const [mapping, setMapping] = useState<ColumnMapping>(initialMapping);
  const [usedSaved] = useState(() => {
    const saved = loadMappingMemory(brandName, platform);
    if (!saved) return false;
    return Object.entries(saved).every(([, col]) => col === null || headers.includes(col as string));
  });

  const updateMapping = (field: FieldKey, value: string | null) => {
    setMapping(prev => ({ ...prev, [field]: value === "__none__" ? null : value }));
  };

  // Validate numeric columns
  const errors = useMemo(() => {
    const errs: string[] = [];
    for (const field of NUMERIC_FIELDS) {
      const col = mapping[field];
      if (!col) continue;
      const fieldDef = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].find(f => f.key === field);
      const fieldErrors = validateNumericColumn(sampleRows, col, fieldDef?.label || field);
      errs.push(...fieldErrors);
    }
    return errs;
  }, [mapping, sampleRows]);

  const requiredMissing = REQUIRED_FIELDS.filter(f => !mapping[f.key]);
  const isValid = requiredMissing.length === 0 && errors.length === 0;

  const handleConfirm = () => {
    if (brandName.trim()) {
      saveMappingMemory(brandName, platform, mapping);
    }
    onConfirm(mapping);
  };

  // Sample data preview for selected column
  const getPreview = (col: string | null) => {
    if (!col || sampleRows.length === 0) return [];
    return sampleRows.slice(0, 3).map(r => r[col] || "—");
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-card rounded-xl border border-border shadow-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Columns className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-foreground">Map Your Columns</h3>
            <p className="text-xs text-muted-foreground">
              Match your CSV headers to the required fields
              {usedSaved && (
                <span className="ml-2 text-primary font-medium">
                  ✓ Using saved mapping for "{brandName}"
                </span>
              )}
            </p>
          </div>
          <span className="text-xs px-2 py-1 rounded-md bg-secondary/10 text-secondary font-semibold">
            {platform}
          </span>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {/* Required Fields */}
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-score-poor" />
              Required Fields
            </p>
            <div className="space-y-2">
              {REQUIRED_FIELDS.map(field => (
                <FieldRow
                  key={field.key}
                  field={field}
                  headers={headers}
                  selectedCol={mapping[field.key]}
                  onChange={val => updateMapping(field.key, val)}
                  preview={getPreview(mapping[field.key])}
                  required
                />
              ))}
            </div>
          </div>

          {/* Optional Fields */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
              Optional Fields
            </p>
            <div className="space-y-2">
              {OPTIONAL_FIELDS.map(field => (
                <FieldRow
                  key={field.key}
                  field={field}
                  headers={headers}
                  selectedCol={mapping[field.key]}
                  onChange={val => updateMapping(field.key, val)}
                  preview={getPreview(mapping[field.key])}
                />
              ))}
            </div>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="p-3 rounded-lg border border-score-poor/30 bg-score-poor/5 space-y-1">
              <div className="flex items-center gap-2 text-score-poor text-xs font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" />
                Data Validation Errors
              </div>
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-score-poor/80 pl-5">{err}</p>
              ))}
            </div>
          )}

          {/* Missing required */}
          {requiredMissing.length > 0 && (
            <div className="p-3 rounded-lg border border-score-warning/30 bg-score-warning/5">
              <p className="text-xs text-score-warning font-medium">
                Missing: {requiredMissing.map(f => f.label).join(", ")}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {brandName.trim() && (
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Save className="w-3 h-3" />
                Mapping will be saved for "{brandName}"
              </span>
            )}
            <button
              onClick={handleConfirm}
              disabled={!isValid}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold
                         hover:opacity-90 transition-opacity active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wand2 className="w-4 h-4" />
              Apply Mapping & Process
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  headers,
  selectedCol,
  onChange,
  preview,
  required = false,
}: {
  field: { key: string; label: string; description: string };
  headers: string[];
  selectedCol: string | null;
  onChange: (val: string | null) => void;
  preview: string[];
  required?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background hover:border-muted-foreground/30 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">{field.label}</span>
          {required && !selectedCol && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-score-poor/10 text-score-poor font-semibold">Required</span>
          )}
          {selectedCol && (
            <Check className="w-3 h-3 text-score-excellent" />
          )}
        </div>
        <p className="text-[10px] text-muted-foreground">{field.description}</p>
      </div>

      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />

      <div className="w-48">
        <Select
          value={selectedCol || "__none__"}
          onValueChange={val => onChange(val === "__none__" ? null : val)}
        >
          <SelectTrigger className={`h-8 text-xs ${selectedCol ? "border-score-excellent/30" : required ? "border-score-warning/30 border-dashed" : ""}`}>
            <SelectValue placeholder="Select column…" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__" className="text-xs text-muted-foreground">— Not mapped —</SelectItem>
            {headers.filter(h => h !== "").map(h => (
              <SelectItem key={h} value={h} className="text-xs">{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Preview values */}
      {preview.length > 0 && (
        <div className="hidden lg:flex gap-1 w-32">
          {preview.map((v, i) => (
            <span key={i} className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded truncate max-w-[40px]" title={v}>
              {v}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
