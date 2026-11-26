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
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta

import pandas as pd
from google.cloud import bigquery

from app.config import GCP_PROJECT, SEO_BQ_DATASET
from app.models.audit import SeoAuditParams, SpecialistResult
from app.models.brand import BrandContext, SeoContext
from app.services import specialist
from app.services.bigquery import run_query
from app.services.seo_criteria import (
    SEO_CATEGORY_TOPICS,
    SEO_TOPIC_METRICS,
    seo_category_frame,
    seo_data_gaps,
    seo_finalise_results,
    seo_has_evidence,
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
# without a market (site-wide data) always count. One n8n run can cover several markets: its rows
# carry a list such as 'NL,BE', and count for each market in it.
_MARKET_FILTER = ("(@market = '' OR market IS NULL OR market = '' "
                  "OR @market IN UNNEST(SPLIT(REPLACE(UPPER(market), ' ', ''), ',')))")


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


def intake_metrics(bc: BrandContext | None) -> dict[str, dict[str, float]]:
    """Intake metrics that follow from the SEO brand context (the intake of the pulse form), per topic. A value in
    BigQuery (e.g. from metric_values) wins over these."""
    if not bc or not bc.seo:
        return {}
    seo = bc.seo
    values: dict[str, float] = {}
    # Only when answered in the form: unknown stays unknown
    if seo.hasOnlineSales is not None:
        values["has_online_sales"] = 1.0 if seo.hasOnlineSales else 0.0
    if seo.isNotable is not None:
        values["is_notable"] = 1.0 if seo.isNotable else 0.0
    out: dict[str, dict[str, float]] = {}
    for topic, metrics in SEO_TOPIC_METRICS.items():
        for metric, (origin, _) in metrics.items():
            if origin == "Intake" and metric in values:
                out.setdefault(topic, {})[metric] = values[metric]
    return out


def extract_seo_audit_data(params: SeoAuditParams, brand_context: BrandContext | None = None) -> dict[str, pd.DataFrame]:
    """One frame per SEO category, in the _source convention of the specialist.

    Reads the latest value of every metric for the site within max_age_days before as_of, the
    latest Screaming Frog crawl in that window, and that crawl's issues, and adds the intake
    metrics from the brand context. Topics without metrics still get a row, so the specialist
    sees every topic.
    """
    site = normalise_site(params.domain)
    if not site:
        raise ValueError("An SEO audit needs a domain")
    as_of = params.as_of or date.today()
    oldest = as_of - timedelta(days=params.max_age_days)
    market = (params.market or "").strip().upper()
    if params.search_console is None:   # not set by the caller: whether BigQuery or the crawl has Search Console data
        params.search_console = has_search_console(site, params.crawl_id or "")
    crawl_id = (params.crawl_id or "").strip()
    n8n_audit_id = (params.n8n_audit_id or "").strip()
    base = [
        bigquery.ScalarQueryParameter("site", "STRING", site),
        bigquery.ScalarQueryParameter("market", "STRING", market),
        bigquery.ScalarQueryParameter("as_of", "DATE", as_of),
        bigquery.ScalarQueryParameter("oldest", "DATE", oldest),
        bigquery.ScalarQueryParameter("crawl_id", "STRING", crawl_id),
        bigquery.ScalarQueryParameter("n8n_audit_id", "STRING", n8n_audit_id),
    ]

    # A chosen n8n run or crawl replaces the other runs or crawls of that source, also outside the window
    metrics = _query("v_seo_metrics", f"""
        SELECT topic, metric, value
        FROM {_view("v_seo_metrics")}
        WHERE site = @site AND {_MARKET_FILTER}
          AND CASE
            WHEN source = 'n8n' AND @n8n_audit_id != '' THEN source_id = @n8n_audit_id
            WHEN source = 'sf_crawl' AND @crawl_id != '' THEN source_id = @crawl_id
            ELSE measured_on BETWEEN @oldest AND @as_of END
        QUALIFY ROW_NUMBER() OVER (PARTITION BY topic, metric ORDER BY measured_on DESC) = 1
    """, base)

    crawls = _query("v_seo_crawl_summary", f"""
        SELECT crawl_id, crawl_date, user_agent, js_rendering, internal_html, indexable_html
        FROM {_view("v_seo_crawl_summary")}
        WHERE site = @site AND (crawl_id = @crawl_id
          OR (@crawl_id = '' AND {_MARKET_FILTER} AND crawl_date BETWEEN @oldest AND @as_of))
        ORDER BY crawl_date DESC, loaded_at DESC  -- the same crawl uploaded again: the last upload
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
    for topic, values in intake_metrics(brand_context).items():
        for metric, value in values.items():
            by_topic.setdefault(topic, {}).setdefault(metric, value)
    logger.warning(
        "SEO extraction for %s (market %s, as of %s): %d metrics on %d topics, crawl %s, %d issue rows",
        site, market or "all", as_of, len(metrics), len(by_topic),
        crawl_summary["crawl_date"], 0 if issues is None else len(issues),
    )
    return {
        category: seo_category_frame(category, by_topic, issues, crawl_summary)
        for category in SEO_CATEGORY_TOPICS
    }


def has_search_console(site: str, crawl_id: str = "") -> bool:
    """True when the audit has the site's Search Console data: Search Console metrics in BigQuery (metric_values, a
    source starting with gsc), or a crawl run with Screaming Frog connected to Search Console (Clicks and Impressions in
    its Internal export, or "Search Console" issues in its folder). The crawl is the chosen one, else the site's latest."""
    df = _query("v_seo_metrics", f"""
        WITH c AS (
          SELECT IF(@crawl_id != '', @crawl_id, (SELECT crawl_id FROM {_view("v_seo_crawl_summary")} WHERE site = @site
                                                 ORDER BY crawl_date DESC, loaded_at DESC LIMIT 1)) AS crawl_id
        )
        SELECT
          (SELECT COUNT(*) FROM {_view("v_seo_metrics")} WHERE site = @site AND STARTS_WITH(source, 'gsc')) AS n_gsc,
          (SELECT COUNT(*) FROM {_view("sf_issues_overview")} AS i, c WHERE i.sf_category = 'Search Console' AND i.crawl_id = c.crawl_id)
          + (SELECT COUNTIF(s.search_console) FROM {_view("v_seo_crawl_summary")} AS s, c WHERE s.crawl_id = c.crawl_id) AS n_sf
    """, [bigquery.ScalarQueryParameter("site", "STRING", site), bigquery.ScalarQueryParameter("crawl_id", "STRING", crawl_id or "")])
    return bool(len(df) and (int(df.iloc[0]["n_gsc"] or 0) > 0 or int(df.iloc[0]["n_sf"] or 0) > 0))


def _crawls_with_search_console(site: str) -> set[str]:
    """The site's crawls run with Screaming Frog connected to Search Console (the crawl's flag, or its issues)."""
    df = _query("sf_issues_overview", f"""
        SELECT DISTINCT crawl_id FROM {_view("sf_issues_overview")}
        WHERE sf_category = 'Search Console' AND REGEXP_REPLACE(LOWER(domain), r'^www\\.', '') = @site
        UNION DISTINCT
        SELECT crawl_id FROM {_view("v_seo_crawl_summary")} WHERE site = @site AND search_console
    """, [bigquery.ScalarQueryParameter("site", "STRING", site)])
    return set(df["crawl_id"]) if len(df) else set()


def _split(text) -> list[str]:
    return [t.strip() for t in str(text or "").split(",") if t.strip()]


_INTAKE_COLS = ["business_model", "online_sales", "wikipedia_notable", "training_bots", "nosnippet_pages"]


def _value(v):
    """A BigQuery value, or None for NULL / NaN / NA."""
    try:
        return None if v is None or pd.isna(v) else v
    except (TypeError, ValueError):
        return v


def pulse_intake(row: dict) -> dict:
    """The intake of a pulse_runs row (section "About the site" of the form), None = unknown."""
    flag = lambda v: None if _value(v) is None else bool(v)
    model = str(_value(row.get("business_model")) or "").upper()
    bots = str(_value(row.get("training_bots")) or "").lower()
    return {
        "business_model": model if model in ("B2B", "B2C", "D2C") else None,
        "online_sales": flag(row.get("online_sales")),
        "wikipedia_notable": flag(row.get("wikipedia_notable")),
        "training_bots": bots if bots in ("allow", "block") else None,
        "nosnippet_pages": [x.strip() for x in str(_value(row.get("nosnippet_pages")) or "").splitlines() if x.strip()],
    }


def _read_pulse_runs(site: str, audit_id: str = "") -> pd.DataFrame:
    """The site's rows in pulse_runs (one run when audit_id is given), newest first; the intake columns are NULL for runs
    from before the intake. An empty frame when the table (or its intake columns) does not exist yet."""
    cols = ["audit_id", "crawl_id", "client", "started_at", "brand_terms", "competitors", *_INTAKE_COLS]
    try:
        return _query("pulse_runs", f"""
            SELECT {", ".join(cols)} FROM {_view("pulse_runs")}
            WHERE REGEXP_REPLACE(LOWER(domain), r'^www\\.', '') = @site AND (@n8n_audit_id = '' OR audit_id = @n8n_audit_id)
            ORDER BY started_at DESC
        """, [bigquery.ScalarQueryParameter("site", "STRING", site),
              bigquery.ScalarQueryParameter("n8n_audit_id", "STRING", (audit_id or "").strip())])
    except RuntimeError as exc:   # a dataset made before pulse_runs (or its intake columns) existed
        logger.warning("pulse_runs not read: %s", exc)
        return pd.DataFrame(columns=cols)


def apply_pulse_context(bc: BrandContext | None, params: SeoAuditParams) -> BrandContext | None:
    """The brand context of the audit from the SEO pulse (the n8n form, table pulse_runs): the client name, the business
    model, the brand terms and competitors the metrics were computed with, and the intake about the site. The chosen run,
    else the site's latest run. The SEO tab has no brand context form; what the run does not say stays as it is."""
    site = normalise_site(params.domain)
    if not bc or not site:
        return bc
    df = _read_pulse_runs(site, params.n8n_audit_id or "")
    seo = (bc.seo or SeoContext()).model_copy(update={"siteUrl": site})
    if df.empty:
        return bc.model_copy(update={"seo": seo})
    row = df.iloc[0].to_dict()
    intake = pulse_intake(row)
    terms, comps = _split(row.get("brand_terms")), _split(row.get("competitors"))
    seo = seo.model_copy(update={
        **({"brandTerms": terms} if terms else {}), **({"competitors": comps} if comps else {}),
        **({"hasOnlineSales": intake["online_sales"]} if intake["online_sales"] is not None else {}),
        **({"isNotable": intake["wikipedia_notable"]} if intake["wikipedia_notable"] is not None else {}),
        **({"trainingBots": intake["training_bots"]} if intake["training_bots"] else {}),
        **({"snippetExceptions": intake["nosnippet_pages"]} if intake["nosnippet_pages"] else {}),
    })
    update = {"seo": seo}
    if intake["business_model"]:
        update["model"] = intake["business_model"]
    if _value(row.get("client")):
        update["brandName"] = str(row["client"])
    return bc.model_copy(update=update)


def list_seo_sites(limit: int = 200) -> list[dict]:
    """The sites with SEO data in BigQuery (a pulse run, an n8n run or a crawl), most recent first, with the client name
    of the latest one: the SEO tab's choice of site."""
    df = _query("v_seo_crawl_summary", f"""
        WITH s AS (
          SELECT site, client, loaded_at AS ts FROM {_view("v_seo_crawl_summary")}
          UNION ALL SELECT site, client, last_write FROM {_view("v_seo_n8n_runs")}
        )
        SELECT site, ARRAY_AGG(client IGNORE NULLS ORDER BY ts DESC LIMIT 1)[SAFE_OFFSET(0)] AS client, MAX(ts) AS last_at
        FROM s WHERE site IS NOT NULL AND site != '' GROUP BY site ORDER BY last_at DESC LIMIT {int(limit)}
    """, [])
    return [{"site": r["site"], "client": _value(r["client"]),
             "last_at": None if _value(r["last_at"]) is None else pd.Timestamp(r["last_at"]).isoformat()}
            for r in df.to_dict("records")]


def list_seo_sources(domain: str, market: str = "", limit: int = 20) -> dict:
    """The Screaming Frog crawls and n8n runs of a site in BigQuery, newest first: the choice of the data an
    SEO audit reads (SeoAuditParams.crawl_id / n8n_audit_id)."""
    site = normalise_site(domain)
    if not site:
        return {"site": "", "crawls": [], "n8n_runs": []}
    params = [bigquery.ScalarQueryParameter("site", "STRING", site),
              bigquery.ScalarQueryParameter("market", "STRING", (market or "").strip().upper())]
    crawls_sql = f"""
        SELECT crawl_id, crawl_date, market, internal_html, indexable_html, external_urls, js_rendering, loaded_at
        FROM {_view("v_seo_crawl_summary")}
        WHERE site = @site AND {_MARKET_FILTER}
        ORDER BY crawl_date DESC, loaded_at DESC
        LIMIT {int(limit)}
    """
    runs_sql = f"""
        SELECT audit_id, run_date, market, checks, n_metrics, first_write, last_write
        FROM {_view("v_seo_n8n_runs")}
        WHERE site = @site AND {_MARKET_FILTER}
        ORDER BY last_write DESC
        LIMIT {int(limit)}
    """

    # The crawls first (it also opens the connection: several first requests at once broke on SSL), then the other
    # four reads at the same time instead of one after the other
    crawls = _query("v_seo_crawl_summary", crawls_sql, params)
    with ThreadPoolExecutor(max_workers=4) as pool:
        f_runs = pool.submit(_query, "v_seo_n8n_runs", runs_sql, params)
        f_links = pool.submit(_read_pulse_runs, site)
        f_gsc_crawls = pool.submit(_crawls_with_search_console, site)
        f_gsc_metrics = pool.submit(has_search_console, site, "-")
        runs, links = f_runs.result(), f_links.result()
        gsc_crawls, gsc_metrics = f_gsc_crawls.result(), f_gsc_metrics.result()

    def plain(v):
        if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT:
            return None
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return v.item() if hasattr(v, "item") else v

    rows = lambda df: [{k: plain(v) for k, v in r.items()} for r in df.to_dict("records")]
    crawl_list, run_list = rows(crawls), rows(runs)
    link_rows = rows(links)
    pulses = pair_pulses(run_list, crawl_list, {r["audit_id"]: r["crawl_id"] for r in link_rows if r.get("crawl_id")})
    context = {r["audit_id"]: r for r in link_rows}
    for p in pulses:   # the client, brand terms, competitors and intake of the form of that run, and Search Console data
        ctx = context.get(p["audit_id"]) or {}
        p["client"] = ctx.get("client")
        p["brand_terms"], p["competitors"] = _split(ctx.get("brand_terms")), _split(ctx.get("competitors"))
        p["intake"] = pulse_intake(ctx)
        p["search_console"] = gsc_metrics or p["crawl_id"] in gsc_crawls
        p["search_console_from"] = "metrics" if gsc_metrics else "crawl" if p["crawl_id"] in gsc_crawls else None
    latest = crawl_list[0]["crawl_id"] if crawl_list else None
    return {"site": site, "search_console": gsc_metrics or latest in gsc_crawls, "pulses": pulses,
            "crawls": crawl_list, "n8n_runs": run_list}


def pair_pulses(runs: list[dict], crawls: list[dict], links: dict[str, str]) -> list[dict]:
    """One SEO pulse per submit of the n8n form: the run and the crawl uploaded with it, newest first. The crawl comes
    from pulse_runs (linked_by "form"); for runs from before that table, the crawl of the site uploaded in the 30
    minutes before the run's first write (linked_by "time"). Crawls no run used are pulses of their own (crawl only)."""
    ts = lambda iso: pd.Timestamp(iso) if iso else None
    by_id = {c["crawl_id"]: c for c in crawls}
    pulses, used = [], set()
    for r in runs:
        cid, how = links.get(r["audit_id"]), "form"
        if not cid:
            start, cid, how = ts(r.get("first_write")), None, None
            near = [c for c in crawls if start is not None and c.get("loaded_at") and c["crawl_id"] not in used
                    and start - pd.Timedelta(minutes=30) <= ts(c["loaded_at"]) <= start]
            if near:
                cid, how = max(near, key=lambda c: ts(c["loaded_at"]))["crawl_id"], "time"
        c = by_id.get(cid, {})
        used.add(cid)
        pulses.append({"audit_id": r["audit_id"], "crawl_id": cid, "at": r.get("first_write") or r.get("last_write"),
                       "checks": r.get("checks"), "n_metrics": r.get("n_metrics"), "linked_by": how,
                       "crawl_date": c.get("crawl_date"), "internal_html": c.get("internal_html"), "js_rendering": c.get("js_rendering")})
    for c in crawls:
        if c["crawl_id"] not in used:
            pulses.append({"audit_id": None, "crawl_id": c["crawl_id"], "at": c.get("loaded_at"), "checks": None, "n_metrics": None,
                           "linked_by": None, "crawl_date": c.get("crawl_date"), "internal_html": c.get("internal_html"),
                           "js_rendering": c.get("js_rendering")})
    return sorted(pulses, key=lambda p: ts(p["at"]) or pd.Timestamp(0, tz="UTC"), reverse=True)


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
        for field, value in bc.seo.model_dump(exclude_none=True).items():
            lines.append(f"{field}: {json.dumps(value, ensure_ascii=False)}")
    else:
        lines.append("SEO brand context not provided.")
    lines.append("SEO fields not listed here (e.g. hasOnlineSales, isNotable, trainingBots) are unknown, "
                 "not false or 0: judge those topics on the data.")
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


# Topics whose metrics the overview shows under the topic: the PageSpeed criteria (the value against Google's bands, field
# or lab, and the opportunities that improve it)
SEO_DETAIL_TOPICS = {"Largest Contentful Paint", "Interaction to Next Paint", "Cumulative Layout Shift", "Performance Score"}


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
        category_gaps = [t for t in gaps.get(category, []) if not seo_has_evidence(t, rows.get(t, {}).get("metrics"))]
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
        finalised = seo_finalise_results(results, frame)
        for r in finalised:   # the metrics of the topic for the overview (PageSpeed: value, source, opportunities)
            if r.topic in SEO_DETAIL_TOPICS:
                metrics = rows.get(r.topic, {}).get("metrics") or {}
                r.details = {k: float(v) for k, v in metrics.items() if v is not None and not pd.isna(v)} or None
        all_results.extend(finalised)

    summary_lines = [
        f"  {r.category}/{r.topic}: {'n/a' if r.not_applicable else r.status}/{r.level} — {r.action[:80]}"
        for r in all_results
    ]
    logger.warning("SEO AUDIT SPECIALIST RESULTS:\n%s", "\n".join(summary_lines))
    return all_results
