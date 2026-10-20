"""
SEO platform pipeline — the SEO counterpart of data_extraction + run_specialist_agent.

  1. extract_seo_audit_data() reads three views in BigQuery (dataset SEO_BQ_DATASET, see
     seo/bigquery/03_app_views.sql) and builds one frame per SEO category with
     seo_category_frame(): each topic's metrics, the status Python computes from them, and the
     Screaming Frog issues behind the topic.
  2. run_seo_specialist() makes one Gemini call per category with the SEO prompt, then calls
     seo_finalise_results(): fixed level per topic, status_computed enforced, n/a topics marked.

The criteria live in seo_criteria.py, which is generated from the SEO pulse sheet (do not
hand-edit it). This file is the hand-written glue between that module and the app.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import date, timedelta

import pandas as pd
from google.cloud import bigquery

from app.config import GCP_PROJECT, SEO_BQ_DATASET
from app.models.audit import SeoAuditParams, SpecialistResult
from app.models.brand import BrandContext
from app.services import specialist
from app.services.bigquery import run_query
from app.services.seo_criteria import (
    SEO_CATEGORY_TOPICS,
    seo_category_frame,
    seo_data_gaps,
    seo_finalise_results,
    seo_system_prompt,
    seo_topic_level,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def normalise_site(domain: str) -> str:
    """Host in lower case without scheme, path and leading www.: the `site` key of the views."""
    host = re.sub(r"^https?://", "", (domain or "").strip().lower()).split("/")[0]
    return re.sub(r"^www\.", "", host)


def _view(name: str) -> str:
    return f"`{GCP_PROJECT}.{SEO_BQ_DATASET}.{name}`"


# Market filter shared by the queries: an empty market reads all markets of the site, and rows
# without a market (site-wide data) always count.
_MARKET_FILTER = "(@market = '' OR market IS NULL OR market = '' OR UPPER(market) = @market)"


def _query(label: str, sql: str, params: list) -> pd.DataFrame:
    try:
        return run_query(sql, params)
    except Exception as exc:
        raise RuntimeError(
            f"SEO data could not be read from BigQuery ({label} in {GCP_PROJECT}.{SEO_BQ_DATASET}): {exc}"
        ) from exc


def _metrics_by_topic(df: pd.DataFrame) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for row in df.itertuples(index=False):
        if pd.notna(row.value):
            out.setdefault(row.topic, {})[row.metric] = float(row.value)
    return out


def extract_seo_audit_data(params: SeoAuditParams) -> dict[str, pd.DataFrame]:
    """One frame per SEO category, in the _source convention of the specialist.

    Reads the latest value of every metric for the site within max_age_days before as_of, the
    latest Screaming Frog crawl in that window, and that crawl's issues. Topics without metrics
    still get a row, so the specialist sees every topic.
    """
    site = normalise_site(params.domain)
    if not site:
        raise ValueError("An SEO audit needs a domain")
    as_of = params.as_of or date.today()
    oldest = as_of - timedelta(days=params.max_age_days)
    market = (params.market or "").strip().upper()
    base = [
        bigquery.ScalarQueryParameter("site", "STRING", site),
        bigquery.ScalarQueryParameter("market", "STRING", market),
        bigquery.ScalarQueryParameter("as_of", "DATE", as_of),
        bigquery.ScalarQueryParameter("oldest", "DATE", oldest),
    ]

    metrics = _query("v_seo_metrics", f"""
        SELECT topic, metric, value
        FROM {_view("v_seo_metrics")}
        WHERE site = @site AND {_MARKET_FILTER} AND measured_on BETWEEN @oldest AND @as_of
        QUALIFY ROW_NUMBER() OVER (PARTITION BY topic, metric ORDER BY measured_on DESC) = 1
    """, base)

    crawls = _query("v_seo_crawl_summary", f"""
        SELECT crawl_id, crawl_date, user_agent, js_rendering, internal_html, indexable_html
        FROM {_view("v_seo_crawl_summary")}
        WHERE site = @site AND {_MARKET_FILTER} AND crawl_date BETWEEN @oldest AND @as_of
        ORDER BY crawl_date DESC
        LIMIT 1
    """, base)

    issues = None
    if crawls.empty:
        crawl_summary = {
            "crawl_date": None,
            "note": f"No Screaming Frog crawl of {site} between {oldest} and {as_of}",
            "search_console": params.search_console,
        }
    else:
        crawl = crawls.iloc[0]
        crawl_date = pd.Timestamp(crawl["crawl_date"]).date()
        crawl_summary = {
            "crawl_date": crawl_date.isoformat(),
            "crawl_age_days": (as_of - crawl_date).days,
            "user_agent": crawl["user_agent"],
            "js_rendering": crawl["js_rendering"],
            "internal_html": crawl["internal_html"],
            "indexable_html": crawl["indexable_html"],
            "search_console": params.search_console,
        }
        issues = _query("v_seo_issue_detail", f"""
            SELECT topic, sf_category, issue_name, issue_type, issue_priority, urls, indexable_urls
            FROM {_view("v_seo_issue_detail")}
            WHERE crawl_id = @crawl_id
        """, [bigquery.ScalarQueryParameter("crawl_id", "STRING", str(crawl["crawl_id"]))])

    by_topic = _metrics_by_topic(metrics)
    logger.warning(
        "SEO extraction for %s (market %s, as of %s): %d metrics on %d topics, crawl %s, %d issue rows",
        site, market or "all", as_of, len(metrics), len(by_topic),
        crawl_summary["crawl_date"], 0 if issues is None else len(issues),
    )
    return {
        category: seo_category_frame(category, by_topic, issues, crawl_summary)
        for category in SEO_CATEGORY_TOPICS
    }


# ---------------------------------------------------------------------------
# Specialist
# ---------------------------------------------------------------------------

def _format_seo_brand_context(bc: BrandContext | None, params: SeoAuditParams) -> str:
    """Brand context block for the SEO prompt, with the field names the SEO calibration uses."""
    lines = ["--- Client Brand Context ---"]
    if bc:
        lines += [f"Client name: {bc.brandName}", f"Business model: {bc.model}"]
        if bc.markets:
            lines.append(f"markets: {', '.join(bc.markets)}")
        if bc.industry:
            lines.append(f"Industry: {bc.industry}")
    lines.append(f"Site: {params.domain}" + (f" (market {params.market})" if params.market else ""))
    if bc and bc.seo:
        for field, value in bc.seo.model_dump().items():
            lines.append(f"{field}: {json.dumps(value, ensure_ascii=False)}")
    else:
        lines.append("SEO brand context not provided: treat hasOnlineSales, lowSearchVolume, locations and "
                     "the other SEO fields as unknown, not as false or 0.")
    lines.append("---")
    return "\n".join(lines) + "\n\n"


def _topic_rows(frame: pd.DataFrame) -> dict[str, dict]:
    rows = frame[frame["_source"] == "topic_results"] if "_source" in frame.columns else frame.iloc[0:0]
    return {r["topic"]: r for r in rows.to_dict("records")}


def _fallback_stubs(category: str, reason: str, frame: pd.DataFrame, gaps: list[str]) -> list[SpecialistResult]:
    """Results when the Gemini call fails. Topics whose status Python computed keep that status
    (it does not depend on Gemini); only the explanation is missing."""
    safe_reason = str(reason)[:200]
    rows = _topic_rows(frame)
    out = []
    for topic in SEO_CATEGORY_TOPICS[category]:
        computed = rows.get(topic, {}).get("status_computed")
        if isinstance(computed, str):
            source = "topic_results"
            explanation = (f"Status computed from the metrics ({rows[topic].get('rule')}); "
                           f"the AI explanation failed: {safe_reason}")
        elif topic in gaps:
            source, explanation = "no_data_source", "No data source for this topic yet."
        else:
            source, explanation = "parse_error", f"Automated analysis failed: {safe_reason}"
        out.append(SpecialistResult(
            topic=topic, category=category, status="warn", level=seo_topic_level(topic), source=source,
            action="Review manually — automated analysis unavailable", explanation=explanation,
        ))
    return out


def run_seo_specialist(
    audit_data: dict[str, pd.DataFrame],
    brand_context: BrandContext | None,
    params: SeoAuditParams,
) -> list[SpecialistResult]:
    """One Gemini call per SEO category, then seo_finalise_results() on its answers."""
    gaps = seo_data_gaps(search_console=params.search_console)
    brand_block = _format_seo_brand_context(brand_context, params)
    all_results: list[SpecialistResult] = []

    for category, frame in audit_data.items():
        topics = SEO_CATEGORY_TOPICS[category]
        # SEO_DATA_GAPS is per rollout phase; a gap topic that already has metrics (e.g. from
        # n8n) is measured, so only topics without any metric are sent as "no data source".
        rows = _topic_rows(frame)
        category_gaps = [t for t in gaps.get(category, []) if not rows.get(t, {}).get("metrics")]
        # One row per topic plus at most 5 issues per topic: give every source enough rows that
        # _summarise_df cuts nothing off (its default of 50 drops topics in the larger categories).
        data_json = specialist._summarise_df(frame, max_rows=3 * max(len(frame), 1))
        try:
            results = specialist._call_gemini(
                category, data_json, topics, brand_context,
                system_prompt=seo_system_prompt(category),
                gaps=category_gaps,
                brand_block=brand_block,
                allow_not_applicable=True,
            )
        except Exception as exc:
            logger.error("SEO specialist failed for category %s: %s", category, exc, exc_info=True)
            results = _fallback_stubs(category, str(exc), frame, category_gaps)
        all_results.extend(seo_finalise_results(results, frame))

    summary_lines = [
        f"  {r.category}/{r.topic}: {'n/a' if r.not_applicable else r.status}/{r.level} — {r.action[:80]}"
        for r in all_results
    ]
    logger.warning("SEO AUDIT SPECIALIST RESULTS:\n%s", "\n".join(summary_lines))
    return all_results
