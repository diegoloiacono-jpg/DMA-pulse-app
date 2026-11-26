import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { SeoExport, SpecialistResult } from "@/lib/apiClient";
import { auditTabName, auditWorkbook, excelValue, issueTabName, sheetName, topicWorkbook } from "./seoExport";

describe("cell values", () => {
  it("numbers in text become numbers; leading zeros, IDs, decimal commas and other text stay text", () => {
    expect(["27", "-3", "0.072", "0", "007", "1234567890123456", "0,5", "1.234.5", "True", "https://a.nl/1", "", null].map(v => excelValue(v)))
      .toEqual([27, -3, 0.072, 0, "007", "1234567890123456", "0,5", "1.234.5", "True", "https://a.nl/1", "", ""]);
  });
});

const result = (topic: string, category: string, status: SpecialistResult["status"] = "warn"): SpecialistResult =>
  ({ topic, category, status, level: "advanced", source: "sf_crawl", action: `Fix ${topic}`, explanation: `Why ${topic}`,
     not_applicable: false }) as SpecialistResult;

const CONTRAST = "WCAG 2.0 AA – Text Requires Higher Color Contrast to Background";
const data: SeoExport = {
  site: "client.nl", crawl_id: "www-client-nl-20261125-abc", n8n_audit_id: "client-nl-202611251503", limit: 2,
  sheets: [
    { topic: "Internal Link Health", topics: ["Internal Link Health"], kind: "issue", title: "Internal Redirection (3XX)",
      sf_category: "Response Codes", issue: "Internal Redirection (3XX)", issue_type: "Warning", issue_priority: "Low",
      columns: ["Address", "Status Code", "Redirect URL", "Indexability"],
      rows: [["https://client.nl/a", "301", "https://client.nl/b", "Non-Indexable"], ["https://client.nl/c", "302", null, "Non-Indexable"]], total: 5 },
    { topic: "Internal Link Health", topics: ["Internal Link Health"], kind: "links", title: "Internal Redirection (3XX) (inlinks)",
      sf_category: "Response Codes", issue: "Internal Redirection (3XX)", issue_type: "Warning", issue_priority: "Low",
      columns: ["Type", "Source", "Destination", "Anchor", "Status Code", "Follow"],
      rows: [["Hyperlink", "https://client.nl/", "https://client.nl/a", "Shop", "301", "True"]], total: 1 },
    { topic: "WCAG Level AA", topics: ["Color Contrast", "WCAG Level AA"], kind: "issue", title: CONTRAST, sf_category: "Accessibility",
      issue: CONTRAST, issue_type: "Warning", issue_priority: "High", columns: ["Address", "Indexability"],
      rows: [["https://client.nl/", "Indexable"]], total: 1 },
    { topic: "llms.txt & ai-catalog.json Hygiene", kind: "n8n", title: "Site files", columns: ["path", "status_code"],
      rows: [["/llms.txt", 200]], total: 1 },
  ],
};
const results = [result("Internal Link Health", "site_structure"), result("Page Titles", "onpage_content", "pass"),
                 result("llms.txt & ai-catalog.json Hygiene", "ai_search_readiness"), result("WCAG Level AA", "accessibility"),
                 result("Color Contrast", "accessibility", "fail")];
const meta = { brandName: "Client", site: "client.nl" };
const rowsOf = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "" });

describe("sheet names", () => {
  it("keep Excel's limits: 31 characters, no []:*?/\\, unique", () => {
    const used = new Set<string>();
    const a = sheetName("Canonical Host & URL Variants: URLs / links [all]", used);
    const b = sheetName("Canonical Host & URL Variants: URLs / links [all]", used);
    expect(a.length).toBeLessThanOrEqual(31);
    expect(a).not.toMatch(/[[\]:*?/\\]/);
    expect(b).not.toBe(a);
    expect(b.length).toBeLessThanOrEqual(31);
  });
  it("an issue tab is '<Screaming Frog tab> - <issue>', its links '(inlinks)', shortened to fit", () => {
    const used = new Set<string>();
    expect(issueTabName("Page Titles", "Below 30 Characters", false, used)).toBe("Page Titles - Below 30 Charact…");   // 31
    expect(issueTabName("", "Internal Redirection (3XX)", true, used)).toBe("Internal Redirection… (inlinks)");
    expect(issueTabName("Response Codes", "Internal Redirection (3XX)", true, used)).toBe("Response Codes - Int… (inlinks)");
    expect(issueTabName("H1", "Missing", false, used)).toBe("H1 - Missing");
  });
  it("other tabs name the criterion (shortened) and the kind", () => {
    const used = new Set<string>();
    expect(auditTabName("Internal Link Health", "Links", used)).toBe("Internal Link Health · Links");
    const long = auditTabName("llms.txt & ai-catalog.json Hygiene", "Site files", used);
    expect(long.length).toBeLessThanOrEqual(31);
    expect(long).toMatch(/^llms\.txt.*… · Site files$/);
    expect(auditTabName("Largest Contentful Paint", "PageSpeed pages", used)).toBe("Largest Contentful Pai… · pages");   // 32 > 31
  });
});

describe("one criterion", () => {
  const wb = topicWorkbook("Internal Link Health", results[0], data, meta);
  it("Summary first, then a tab per issue with its inlinks", () => {
    expect(wb.SheetNames).toEqual(["Summary", "Internal Redirection (3XX)", "Internal Redirection… (inlinks)"]);
  });
  it("the summary has status, action, the sources and per tab its rows, Screaming Frog tab, type and priority", () => {
    const rows = rowsOf(wb, "Summary");
    const two = rows.map(r => r.slice(0, 2));
    expect(two).toContainEqual(["Status", "warn"]);
    expect(two).toContainEqual(["Action", "Fix Internal Link Health"]);
    expect(two).toContainEqual(["Screaming Frog crawl", "www-client-nl-20261125-abc"]);
    expect(rows).toContainEqual(["Internal Redirection (3XX)", "2 of 5", "Response Codes", "Warning", "Low"]);
    expect(rows).toContainEqual(["Internal Redirection… (inlinks)", "1", "Response Codes", "Warning", "Low"]);
  });
  it("an issue tab has Screaming Frog's own columns, the rows and a filter; empty cells stay empty", () => {
    expect(rowsOf(wb, "Internal Redirection (3XX)")).toEqual([["Address", "Status Code", "Redirect URL", "Indexability"],
      ["https://client.nl/a", 301, "https://client.nl/b", "Non-Indexable"], ["https://client.nl/c", 302, "", "Non-Indexable"]]);
    expect(wb.Sheets["Internal Redirection (3XX)"]["!autofilter"]).toEqual({ ref: "A1:D3" });
    expect(rowsOf(wb, "Internal Redirection… (inlinks)")[0]).toEqual(["Type", "Source", "Destination", "Anchor", "Status Code", "Follow"]);
  });
  it("an issue of two criteria is in the export of each", () => {
    const tab = CONTRAST.slice(0, 30).trimEnd() + "…";
    expect(topicWorkbook("Color Contrast", results[4], data, meta).SheetNames).toEqual(["Summary", tab]);
    expect(topicWorkbook("WCAG Level AA", results[3], data, meta).SheetNames).toEqual(["Summary", tab]);
  });
  it("a criterion without rows says so", () => {
    const empty = topicWorkbook("Page Titles", results[1], data, meta);
    expect(empty.SheetNames).toEqual(["Summary"]);
    expect(JSON.stringify(rowsOf(empty, "Summary"))).toMatch(/No rows to export/);
  });
});

describe("whole audit", () => {
  const wb = auditWorkbook(results, data, meta);
  it("Overview, then every tab once in the order of the export", () => {
    expect(wb.SheetNames).toEqual(["Overview", "Response Codes - Internal Redi…", "Response Codes - Int… (inlinks)",
                                   "Accessibility - WCAG 2.0 AA –…", wb.SheetNames[4]]);
    expect(wb.SheetNames[4]).toMatch(/· Site files$/);
  });
  it("every criterion in the overview, linked to its first tab; a shared issue listed under both", () => {
    const rows = rowsOf(wb, "Overview");
    const head = rows.findIndex(r => r[0] === "Category");
    expect(rows[head]).toEqual(["Category", "Criterion", "Status", "Tier", "Action", "Explanation", "Tabs", "Rows"]);
    expect(rows.slice(head + 1).map(r => r[1])).toEqual(results.map(r => r.topic));
    expect(rows[head + 1][6]).toBe("Response Codes - Internal Redi…, Response Codes - Int… (inlinks)");
    expect(rows[head + 1][7]).toBe("Response Codes - Internal Redi…: 2 of 5; Response Codes - Int… (inlinks): 1");
    expect(rows[head + 2][6]).toBe("");
    expect(rows[head + 4][6]).toBe("Accessibility - WCAG 2.0 AA –…");
    expect(rows[head + 5][6]).toBe("Accessibility - WCAG 2.0 AA –…");
    const ws = wb.Sheets["Overview"];
    expect(ws[XLSX.utils.encode_cell({ r: head + 1, c: 1 })].l.Target).toBe("#'Response Codes - Internal Redi…'!A1");
    expect(ws[XLSX.utils.encode_cell({ r: head + 2, c: 1 })].l).toBeUndefined();
    expect(ws[XLSX.utils.encode_cell({ r: head + 5, c: 1 })].l.Target).toBe("#'Accessibility - WCAG 2.0 AA –…'!A1");
  });
  it("writes a valid xlsx file", () => {
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    const back = XLSX.read(buf, { type: "array" });
    expect(back.SheetNames).toEqual(wb.SheetNames);
  });
});
