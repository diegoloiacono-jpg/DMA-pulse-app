/**
 * Excel exports of an SEO audit, built in the browser from GET /api/audit/seo/export:
 *  - one criterion: a Summary tab (status, action, what the tabs hold) and its tabs: per Screaming Frog issue its URLs with
 *    the columns of the issue file and its inlinks (as Screaming Frog exports them), the PageSpeed pages, the n8n checks;
 *  - the whole audit: an Overview tab (every criterion with status and action, linked to its tabs) and the same tabs for
 *    every criterion, in the order of the criteria; an issue of several criteria has one tab.
 */
import * as XLSX from "xlsx";
import type { SeoExport, SeoExportSheet, SpecialistResult } from "@/lib/apiClient";
import { categoryLabel } from "@/lib/categoryLabel";

type Cell = string | number | boolean | null;

/** Excel tab names: max. 31 characters, no []:*?/\, unique (case-insensitive). */
export function sheetName(base: string, used: Set<string>): string {
  const clean = base.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim() || "Sheet";
  let name = clean.slice(0, 31);
  for (let i = 2; used.has(name.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    name = clean.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(name.toLowerCase());
  return name;
}

/** The tab of a Screaming Frog issue: "<tab> - <issue>" (category "" for the issue alone), " (inlinks)" for its links,
 *  the name shortened to fit and the suffix kept. */
export function issueTabName(category: string, issue: string, links: boolean, used: Set<string>): string {
  const suffix = links ? " (inlinks)" : "";
  let base = category ? `${category} - ${issue}` : issue;
  if (base.length + suffix.length > 31) base = base.slice(0, 31 - suffix.length - 1).trimEnd() + "…";
  return sheetName(base + suffix, used);
}

/** The tab name of a sheet: an issue by its name, other sheets "<criterion> · <kind>" (the criterion shortened). */
export function tabName(s: SeoExportSheet, used: Set<string>): string {
  if ((s.kind === "issue" || s.kind === "links") && s.issue) return issueTabName(s.sf_category ?? "", s.issue, s.kind === "links", used);
  return auditTabName(s.topic, s.title, used);
}

/** The sheets of a criterion: filed under it, or an issue that also counts for it. */
export const sheetsOfTopic = (data: SeoExport, topic: string) =>
  data.sheets.filter(s => s.topic === topic || (s.topics ?? []).includes(topic));

/** The tab name of a criterion's sheet in the whole-audit workbook: "<criterion> · <kind>", the criterion shortened. */
export function auditTabName(topic: string, title: string, used: Set<string>): string {
  const kind = title === "PageSpeed pages" ? "pages" : title;
  const room = 31 - kind.length - 3;
  const t = topic.length > room ? topic.slice(0, room - 1).trimEnd() + "…" : topic;
  return sheetName(`${t} · ${kind}`, used);
}

/** A cell as Excel shows it: numbers in Screaming Frog's text ("27", "0.5") as numbers; leading zeros, long digit strings
 *  (IDs) and a decimal comma stay text. */
export function excelValue(v: Cell): string | number | boolean {
  if (v === null) return "";
  if (typeof v === "string" && v.length <= 15 && /^-?(0|[1-9]\d*)(\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function table(columns: string[], rows: Cell[][]): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([columns, ...rows.map(r => r.map(excelValue))]);
  if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
  ws["!cols"] = columns.map((c, i) => ({
    wch: Math.min(70, Math.max(c.length, ...rows.slice(0, 300).map(r => String(r[i] ?? "").length)) + 2),
  }));
  return ws;
}

const count = (s: SeoExportSheet) =>
  s.rows.length < s.total ? `${s.rows.length.toLocaleString("en")} of ${s.total.toLocaleString("en")}` : s.total.toLocaleString("en");

const statusOf = (r?: SpecialistResult) => (!r ? "" : r.not_applicable ? "n/a" : r.status);

/** Links a cell to a tab of the same workbook. */
function linkTo(ws: XLSX.WorkSheet, row: number, col: number, tab: string) {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  if (ws[ref]) ws[ref].l = { Target: `#'${tab.replace(/'/g, "''")}'!A1`, Tooltip: `Open ${tab}` };
}

interface Meta { brandName: string; site: string }

function sourceLines(data: SeoExport, meta: Meta): Cell[][] {
  return [
    ["Client", meta.brandName || ""],
    ["Site", data.site],
    ["Screaming Frog crawl", data.crawl_id ?? "none"],
    ["n8n run", data.n8n_audit_id ?? "none"],
    ["Exported", new Date().toISOString().slice(0, 16).replace("T", " ")],
  ];
}

/** One criterion: Summary + its tabs. */
export function topicWorkbook(topic: string, result: SpecialistResult | undefined, data: SeoExport, meta: Meta): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>(["summary"]);
  const sheets = sheetsOfTopic(data, topic);
  const names = sheets.map(s => (s.kind === "issue" || s.kind === "links") && s.issue
    ? issueTabName("", s.issue, s.kind === "links", used) : sheetName(s.title, used));
  const summary: Cell[][] = [
    ["Criterion", topic],
    ["Category", result ? categoryLabel(result.category) : ""],
    ["Status", statusOf(result)],
    ["Tier", result?.level ?? ""],
    ["Action", result?.action ?? ""],
    ["Explanation", result?.explanation ?? ""],
    [],
    ...sourceLines(data, meta),
    [],
    ["Tab", "Rows", "Screaming Frog tab", "Type", "Priority"],
    ...sheets.map((s, i) => [names[i], count(s), s.sf_category ?? "", s.issue_type ?? "", s.issue_priority ?? ""] as Cell[]),
  ];
  if (!sheets.length) summary.push(["No rows to export for this criterion (no Screaming Frog issues or n8n checks behind it)."]);
  const ws = XLSX.utils.aoa_to_sheet(summary.map(r => r.map(v => (v === null ? "" : v))));
  ws["!cols"] = [{ wch: 34 }, { wch: 90 }, { wch: 20 }, { wch: 12 }, { wch: 10 }];
  const first = summary.findIndex(r => r[0] === "Tab") + 1;
  names.forEach((n, i) => linkTo(ws, first + i, 0, n));
  XLSX.utils.book_append_sheet(wb, ws, "Summary");
  sheets.forEach((s, i) => XLSX.utils.book_append_sheet(wb, table(s.columns, s.rows), names[i]));
  return wb;
}

/** The whole audit: Overview + a tab per criterion and kind. */
export function auditWorkbook(results: SpecialistResult[], data: SeoExport, meta: Meta): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>(["overview"]);
  // every sheet once (in the order of the export), listed under each criterion it belongs to
  const named = data.sheets.map(s => ({ sheet: s, name: tabName(s, used) }));
  const byTopic = new Map<string, { sheet: SeoExportSheet; name: string }[]>();
  for (const n of named)
    for (const t of new Set([n.sheet.topic, ...(n.sheet.topics ?? [])])) byTopic.set(t, [...(byTopic.get(t) ?? []), n]);
  const head: Cell[] = ["Category", "Criterion", "Status", "Tier", "Action", "Explanation", "Tabs", "Rows"];
  const rows: Cell[][] = results.map(r => {
    const tabs = byTopic.get(r.topic) ?? [];
    return [categoryLabel(r.category), r.topic, statusOf(r), r.level, r.action, r.explanation,
            tabs.map(t => t.name).join(", "), tabs.map(t => `${t.name}: ${count(t.sheet)}`).join("; ")];
  });
  const intro = sourceLines(data, meta);
  const ws = XLSX.utils.aoa_to_sheet([...intro, [], head, ...rows].map(r => r.map(v => (v === null ? "" : v))));
  const headRow = intro.length + 1;
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headRow, c: 0 }, e: { r: headRow + rows.length, c: head.length - 1 } }) };
  ws["!cols"] = [{ wch: 26 }, { wch: 34 }, { wch: 8 }, { wch: 10 }, { wch: 60 }, { wch: 60 }, { wch: 40 }, { wch: 40 }];
  results.forEach((r, i) => {
    const tabs = byTopic.get(r.topic);
    if (tabs?.length) linkTo(ws, headRow + 1 + i, 1, tabs[0].name);
  });
  XLSX.utils.book_append_sheet(wb, ws, "Overview");
  // the tabs in the order of the export (the criteria; an issue of several criteria under the first of them)
  for (const { sheet, name } of named) XLSX.utils.book_append_sheet(wb, table(sheet.columns, sheet.rows), name);
  return wb;
}

export function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename.replace(/[\\/:*?"<>|]/g, "-"), { compression: true });
}
