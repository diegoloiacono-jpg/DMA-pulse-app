"""
SEO export: the rows behind each criterion, for the Excel exports of the SEO tab (one criterion, or all of them in one
workbook with a tab per criterion). Read from the raw tables in BigQuery (dataset SEO_BQ_DATASET), for the crawl and the
n8n run the audit used:

  issue      per Screaming Frog issue mapped to the criterion: its URLs with the columns of the issue file (sf_issue_urls.cells,
             the columns in sf_issues_overview.url_columns), as Screaming Frog exports them
  links      per issue its inlinks with the columns of the Inlinks export (sf_issue_inlinks.cells): where to fix them
  pagespeed  per page the PageSpeed values and opportunities that belong to the criterion (sf_pages)
  n8n        the n8n checks of the criterion: bot tests, page facts, site checks, LLM scores, Ahrefs, ... (one sheet per table)

The workbook itself is built in the browser (frontend/src/utils/seoExport.ts). Hand-written, not generated.
"""
from __future__ import annotations

import json
import math
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

import pandas as pd
from google.cloud import bigquery

from app.config import GCP_PROJECT, SEO_BQ_DATASET
from app.services.bigquery import run_query
from app.services.seo_criteria import SEO_CATEGORY_TOPICS

MAX_ROWS = 50_000   # per sheet; Excel holds 1,048,576 rows, Cloud Run answers up to 32 MB

PAGESPEED_TOPICS = ("Largest Contentful Paint", "Interaction to Next Paint", "Cumulative Layout Shift", "Performance Score")

# The n8n checks behind a criterion: (table, extra filter, columns; None = all but the run columns). The filters are fixed
# strings, never user input.
_FACTS = "url, is_home, http_status"
N8N_SOURCES: dict[str, list[tuple[str, str | None, str | None]]] = {
    "Robots.txt Configuration": [("site_checks", "kind = 'robots'", "url, http_status, n_sitemap_lines, error")],
    "Canonical Host & URL Variants": [("site_checks", "kind = 'variant'", "page_url, variant, url, http_status, location, canonical, outcome, error")],
    "Error Handling & Soft 404s": [("site_checks", "kind = 'nonexistent'", "url, http_status, location, error")],
    "Semantic HTML": [("page_facts", None, f"{_FACTS}, has_main, has_article, error")],
    "Structured Formatting": [("page_facts", None, f"{_FACTS}, list_or_table_in_main, error")],
    "Author & E-E-A-T Signals": [("page_facts", None, f"{_FACTS}, is_editorial, author_visible, author_link, article_author_markup, error")],
    "Content Freshness": [("page_facts", None, f"{_FACTS}, date_modified, date_published, visible_date, error")],
    "Organization Schema & sameAs": [("page_facts", None, f"{_FACTS}, org_markup, org_markup_valid, n_sameas, error")],
    "Snippet Directives": [("page_facts", None, f"{_FACTS}, has_data_nosnippet, max_snippet, snippet_documented, error")],
    "AI Crawler Access": [("ai_bot_tests", None, "bot, bot_type, url, robots_allowed, http_status, blocked, block_signal, error")],
    "Answer-First Content": [("llm_page_scores", "task = 'answer_first'",
                              "url, http_status, meets_rubric, answers_first_paragraph, plain_language, follow_ups_covered, error")],
    "FAQ & Question Coverage": [("llm_page_scores", "task = 'faq_coverage'",
                                 "url, role, http_status, main_questions_answered, has_faq_block, question_source, questions_total, "
                                 "questions_answered_in_faq, questions_answered_on_page, result_json, error")],
    "Brand Consistency": [("llm_page_scores", "task = 'brand_consistency'",
                           "n_core_claims, n_claims_without_evidence, n_usps_contradicting, result_json, error")],
    "Verified Agent Access": [("verified_agent_tests", None, "role, url, browser_run_ok, page_title, blocked, block_signal, plain_status, plain_blocked, error")],
    "Agent Catalog Access (UCP)": [("ucp_agent_tests", None, None)],
    "llms.txt & ai-catalog.json Hygiene": [("site_file_checks", None, "path, url, status_code, content_type, bytes, location, error")],
    "Agent Accessibility Tree": [("psi_agentic", None, "page_type, url, http_status, agent_accessibility_tree_score, agent_accessibility_tree_mode, agent_tree_details, error")],
    "WebMCP Readiness": [("psi_agentic", None, "page_type, url, webmcp_form_coverage_score, webmcp_registered_tools_score, webmcp_schema_validity_score, error")],
    "Wikipedia & Wikidata": [("wikidata_items", None, "item_id, item_label, official_website, wikipedia_sitelinks, error"),
                             ("wikipedia_links", None, "wiki, page_title, link_url, error")],
    "Source Citations": [("ahrefs_citations", None, "url, http_status, n_external_links, n_external_domains, max_cited_dr, cites_dr50, cited_domains, error")],
    "Referring Domain Strength": [("ahrefs_authority", "call IN ('batch', 'history')", "call, target, role, domain_rating, refdomains, refdomains_dofollow, refdomains_12m_ago, details, error")],
    "Fresh Authoritative Links": [("ahrefs_authority", "call = 'refdomains'", "target, role, n_rows, capped, n_new_refdomains_5k, details, error")],
    "Link-Earning Pages": [("ahrefs_authority", "call = 'best_links'", "target, role, n_rows, n_pages_10plus, details, error")],
    "Anchor Text Profile": [("ahrefs_authority", "call = 'anchors'", "target, anchor_refdomains_total, anchor_refdomains_keyword, anchor_refdomains_brand, "
                                                                     "anchor_refdomains_url, anchor_refdomains_generic, details, error")],
    "Broken Backlinks": [("ahrefs_authority", "call = 'broken'", "target, n_rows, n_refdomains_dr20_to_4xx, details, error")],
}
N8N_LABEL = {"site_checks": "Site checks", "page_facts": "Page facts", "ai_bot_tests": "AI bot tests", "llm_page_scores": "LLM scores",
             "verified_agent_tests": "Agent tests", "ucp_agent_tests": "UCP tests", "site_file_checks": "Site files",
             "psi_agentic": "Lighthouse agentic", "wikidata_items": "Wikidata", "wikipedia_links": "Wikipedia links",
             "ahrefs_citations": "Citations", "ahrefs_authority": "Ahrefs"}

# PageSpeed per page: (column header, sf_pages column or psi_savings key / divisor) per criterion
_PS_COLS = {
    "Largest Contentful Paint": [("LCP lab (ms)", "lab_lcp_ms"), ("LCP field (ms)", "crux_lcp_ms"), ("Core Web Vitals assessment", "cwv_assessment"),
                                 ("Render-blocking (ms saved)", ("render_blocking_ms", 1)), ("Unused CSS (ms saved)", ("unused_css_ms", 1)),
                                 ("Font display (ms saved)", ("font_display_ms", 1)), ("Image delivery (kB saved)", ("image_delivery_bytes", 1024)),
                                 ("Cache lifetimes (kB saved)", ("cache_bytes", 1024))],
    "Interaction to Next Paint": [("TBT lab (ms)", "lab_tbt_ms"), ("INP field (ms)", "crux_inp_ms"),
                                  ("Unused JavaScript (ms saved)", ("unused_js_ms", 1)), ("JavaScript execution (ms)", ("js_execution_ms", 1)),
                                  ("Main-thread work (ms)", ("main_thread_ms", 1)), ("Legacy JavaScript (kB saved)", ("legacy_js_bytes", 1024)),
                                  ("DOM size (elements)", ("dom_size", 1))],
    "Cumulative Layout Shift": [("CLS lab", "lab_cls"), ("CLS field", "crux_cls")],
    "Performance Score": [("Performance score", "perf_score"), ("Page weight (kB)", ("page_bytes", 1024)), ("LCP lab (ms)", "lab_lcp_ms"),
                          ("TBT lab (ms)", "lab_tbt_ms"), ("CLS lab", "lab_cls")],
}
_PS_SORT = {"Largest Contentful Paint": "lab_lcp_ms", "Interaction to Next Paint": "lab_tbt_ms", "Cumulative Layout Shift": "lab_cls",
            "Performance Score": "perf_score"}


def _t(name: str) -> str:
    return f"`{GCP_PROJECT}.{SEO_BQ_DATASET}.{name}`"


def _plain(v):
    """A cell value Excel can take: None for missing, ISO text for dates, Python numbers."""
    if v is None or v is pd.NA or v is pd.NaT:
        return None
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, (pd.Timestamp, datetime)):
        return v.isoformat(sep=" ", timespec="seconds") if not pd.isna(v) else None
    if isinstance(v, date):
        return v.isoformat()
    if hasattr(v, "item"):   # numpy scalars
        v = v.item()
        return None if isinstance(v, float) and math.isnan(v) else v
    return v


def _rows(df: pd.DataFrame, cols: list[str]) -> list[list]:
    return [[_plain(v) for v in rec] for rec in df[cols].itertuples(index=False, name=None)]


def _sheet(topic: str, kind: str, title: str, columns: list[str], rows: list[list], total: int) -> dict:
    return {"topic": topic, "kind": kind, "title": title, "columns": columns, "rows": rows, "total": int(total)}


def resolve_n8n_run(site: str, crawl_id: str) -> str:
    """The n8n run the export reads when the audit did not pick one: the run that uploaded the crawl, else the latest."""
    df = run_query(f"""
        SELECT audit_id FROM {_t("pulse_runs")}
        WHERE REGEXP_REPLACE(LOWER(domain), r'^www\\.', '') = @site
        ORDER BY IF(@crawl_id != '' AND crawl_id = @crawl_id, 0, 1), started_at DESC
        LIMIT 1
    """, [bigquery.ScalarQueryParameter("site", "STRING", site), bigquery.ScalarQueryParameter("crawl_id", "STRING", crawl_id)])
    return str(df.iloc[0]["audit_id"]) if len(df) else ""


def _cells(raw, n: int) -> list | None:
    """A stored row (JSON array) cut or padded to the n columns of its file; None when it is missing or broken."""
    if not isinstance(raw, str) or not raw.startswith("["):
        return None
    try:
        cells = json.loads(raw)
    except ValueError:
        return None
    return [(c if c != "" else None) for c in cells[:n]] + [None] * max(0, n - len(cells))


def _known_row(columns: list[str], rec: dict, kind: str) -> list:
    """A row in the file's columns from what is stored for every URL or link (address, indexability, JS share; source,
    destination, anchor, position); the other columns stay empty."""
    if kind == "issue":
        idx = _plain(rec.get("indexable"))
        known = {"address": rec.get("url"), "js word count %": _plain(rec.get("js_word_pct")),
                 "indexability": None if idx is None else ("Indexable" if idx else "Non-Indexable")}
    else:
        known = {"source": rec.get("source"), "destination": rec.get("destination"), "anchor": rec.get("anchor"),
                 "link position": rec.get("link_position")}
    return [known.get(c.strip().lower()) for c in columns]


def _issue_sheets(crawl_id: str, topic: str, limit: int) -> list[dict]:
    """One sheet per Screaming Frog issue with the columns of its file, and one per issue with its inlinks. Crawls uploaded
    before 26 Nov 2026 have no columns and cells stored: those sheets show the URL (or the link) and what was kept."""
    p = [bigquery.ScalarQueryParameter("crawl_id", "STRING", crawl_id), bigquery.ScalarQueryParameter("topic", "STRING", topic),
         bigquery.ScalarQueryParameter("lim", "INT64", limit)]
    prio = "CASE m.issue_priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END"
    # each issue once, with every criterion it counts for (an accessibility rule: its theme and its WCAG level)
    m = (f"(SELECT sf_category, issue_name, ANY_VALUE(issue_type) AS issue_type, ANY_VALUE(issue_priority) AS issue_priority, "
         f"ARRAY_AGG(DISTINCT topic) AS topics FROM {_t('sf_issue_map')} WHERE topic IS NOT NULL GROUP BY 1, 2 "
         f"HAVING @topic = '' OR @topic IN UNNEST(topics))")
    o = (f"(SELECT sf_category, issue_name, url_columns, link_columns FROM {_t('sf_issues_overview')} WHERE crawl_id = @crawl_id "
         f"QUALIFY ROW_NUMBER() OVER (PARTITION BY sf_category, issue_name ORDER BY loaded_at DESC) = 1)")
    urls = run_query(f"""
        WITH u AS (
          SELECT sf_category, issue_name, url, indexable, js_word_pct, cells FROM {_t("sf_issue_urls")} WHERE crawl_id = @crawl_id
          QUALIFY ROW_NUMBER() OVER (PARTITION BY sf_category, issue_name, url ORDER BY loaded_at DESC) = 1)
        SELECT u.sf_category, u.issue_name, m.issue_type, m.issue_priority, m.topics, u.url, u.indexable, u.js_word_pct, u.cells,
          o.url_columns AS file_columns, COUNT(*) OVER (PARTITION BY u.sf_category, u.issue_name) AS n_total
        FROM u JOIN {m} AS m USING (sf_category, issue_name) LEFT JOIN {o} AS o USING (sf_category, issue_name)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY u.sf_category, u.issue_name ORDER BY u.url) <= @lim
        ORDER BY {prio}, u.sf_category, u.issue_name, u.url
    """, p)
    links = run_query(f"""
        WITH l AS (
          SELECT sf_category, issue_name, source, destination, anchor, link_position, cells FROM {_t("sf_issue_inlinks")} WHERE crawl_id = @crawl_id
          QUALIFY ROW_NUMBER() OVER (PARTITION BY sf_category, issue_name, source, destination, anchor, link_position ORDER BY loaded_at DESC) = 1)
        SELECT l.sf_category, l.issue_name, m.issue_type, m.issue_priority, m.topics, l.source, l.destination, l.anchor, l.link_position, l.cells,
          o.link_columns AS file_columns, COUNT(*) OVER (PARTITION BY l.sf_category, l.issue_name) AS n_total
        FROM l JOIN {m} AS m USING (sf_category, issue_name) LEFT JOIN {o} AS o USING (sf_category, issue_name)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY l.sf_category, l.issue_name ORDER BY l.destination, l.source) <= @lim
        ORDER BY {prio}, l.sf_category, l.issue_name, l.destination, l.source
    """, p)
    sheets = []
    for kind, df in (("issue", urls), ("links", links)):
        for (cat, issue), g in df.groupby(["sf_category", "issue_name"], sort=False):
            first = g.iloc[0]
            topics = [str(t) for t in (first["topics"] if first["topics"] is not None else [])]
            columns = None
            if isinstance(first["file_columns"], str) and first["file_columns"].startswith("["):
                try:
                    columns = [str(c) for c in json.loads(first["file_columns"])]
                except ValueError:
                    columns = None
            if columns and g["cells"].notna().any():
                # Screaming Frog's columns; a row without cells (beyond the 50,000 the form keeps) gets what is known by name
                heads = columns
                rows = [_cells(c, len(columns)) or _known_row(columns, rec, kind)
                        for c, rec in zip(g["cells"], g.to_dict("records"))]
            elif kind == "issue":   # no columns or cells stored (an older upload): what was kept
                js = g["js_word_pct"].notna().any()
                heads = ["Address", "Indexable"] + (["JS word count %"] if js else [])
                rows = _rows(g, ["url", "indexable"] + (["js_word_pct"] if js else []))
            else:
                heads = ["Source", "Destination", "Anchor", "Link position"]
                rows = _rows(g, ["source", "destination", "anchor", "link_position"])
            sheet = _sheet(topics[0] if topics else "", kind, issue if kind == "issue" else f"{issue} (inlinks)", heads, rows, first["n_total"])
            sheet.update(topics=topics, sf_category=str(cat), issue=str(issue), issue_type=_plain(first["issue_type"]),
                         issue_priority=_plain(first["issue_priority"]))
            sheets.append(sheet)
    return sheets


def _pagespeed_sheets(crawl_id: str, topic: str, limit: int) -> list[dict]:
    topics = [t for t in PAGESPEED_TOPICS if not topic or t == topic]
    if not topics:
        return []
    df = run_query(f"""
        SELECT url, perf_score, lab_lcp_ms, lab_tbt_ms, lab_cls, crux_lcp_ms, crux_inp_ms, crux_cls, cwv_assessment, psi_savings
        FROM {_t("sf_pages")}
        WHERE crawl_id = @crawl_id AND status = 200 AND indexability = 'Indexable' AND (lab_lcp_ms IS NOT NULL OR crux_lcp_ms IS NOT NULL)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY url ORDER BY loaded_at DESC) = 1
    """, [bigquery.ScalarQueryParameter("crawl_id", "STRING", crawl_id)])
    if df.empty:
        return []
    savings = [json.loads(s) if isinstance(s, str) and s.strip().startswith("{") else {} for s in df["psi_savings"]]
    sheets = []
    for t in topics:
        cols = _PS_COLS[t]
        order = df[_PS_SORT[t]].astype(float)
        idx = order.sort_values(ascending=(t == "Performance Score"), na_position="last").index[:limit]
        rows = []
        for i in idx:
            rec = df.loc[i]
            row = [rec["url"]]
            for _, src in cols:
                if isinstance(src, tuple):
                    v = savings[i].get(src[0]) if i < len(savings) else None
                    row.append(None if v is None else round(float(v) / src[1], 1))
                else:
                    row.append(_plain(rec[src]))
            rows.append(row)
        sheets.append(_sheet(t, "pagespeed", "PageSpeed pages", ["Address"] + [h for h, _ in cols], rows, len(df)))
    return sheets


def _n8n_sheet(topic: str, table: str, where: str | None, cols: str | None, run: str, limit: int) -> dict | None:
    select = cols or "* EXCEPT (audit_id, client, market, domain)"
    df = run_query(f"""
        SELECT {select}, COUNT(*) OVER () AS n_total FROM {_t(table)}
        WHERE audit_id = @run{' AND ' + where if where else ''}
        LIMIT @lim
    """, [bigquery.ScalarQueryParameter("run", "STRING", run), bigquery.ScalarQueryParameter("lim", "INT64", limit)])
    if df.empty:
        return None
    names = [c for c in df.columns if c != "n_total"]
    return _sheet(topic, "n8n", N8N_LABEL.get(table, table), names, _rows(df, names), df["n_total"].iloc[0])


def export_sheets(site: str, crawl_id: str = "", n8n_audit_id: str = "", topic: str = "", limit: int = 10_000) -> dict:
    """The sheets for one criterion (topic) or all of them (topic ''), in the order of the criteria."""
    limit = max(1, min(int(limit), MAX_ROWS))
    run = n8n_audit_id or resolve_n8n_run(site, crawl_id)
    jobs = []
    if crawl_id:
        jobs.append(lambda: _issue_sheets(crawl_id, topic, limit))
        jobs.append(lambda: _pagespeed_sheets(crawl_id, topic, limit))
    if run:
        for t, sources in N8N_SOURCES.items():
            if topic and t != topic:
                continue
            for table, where, cols in sources:
                jobs.append(lambda t=t, table=table, where=where, cols=cols: [s for s in [_n8n_sheet(t, table, where, cols, run, limit)] if s])
    with ThreadPoolExecutor(max_workers=8) as pool:
        sheets = [s for part in pool.map(lambda f: f(), jobs) for s in part]
    order = {t: i for i, t in enumerate(t for ts in SEO_CATEGORY_TOPICS.values() for t in ts)}
    prio = {"High": 0, "Medium": 1, "Low": 2}
    for s in sheets:   # an issue of several criteria: under the first of them
        if s.get("topics"):
            s["topic"] = min(s["topics"], key=lambda t: order.get(t, 999))
    group = {"issue": 0, "links": 0, "pagespeed": 1, "n8n": 2}
    sheets.sort(key=lambda s: (order.get(s["topic"], 999), group[s["kind"]], prio.get(s.get("issue_priority") or "", 9),
                               s.get("sf_category") or "", s.get("issue") or s["title"], s["kind"] == "links", s["title"]))
    return {"site": site, "crawl_id": crawl_id or None, "n8n_audit_id": run or None, "limit": limit, "sheets": sheets}
