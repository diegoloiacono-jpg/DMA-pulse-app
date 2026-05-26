"""
Meta Ads → BigQuery extractor — Cloud Function (HTTP trigger).

Fetches Campaigns, AdSets, Ads, AdInsights, and CustomAudiences for a single
Meta ad account and writes them to BigQuery tables in the `meta_data` dataset.

Insights are fetched in 7-day chunks (daily breakdown) to stay well within
the Facebook API's per-request data limits.

Environment variables (required):
  GCP_PROJECT        — GCP project ID
  META_ACCESS_TOKEN  — Long-lived Meta user access token (or system-user token)

Environment variables (optional):
  META_DATASET       — BQ dataset name (default: meta_data)
  META_LOOKBACK_DAYS — Days of insight history to fetch (default: 30)

HTTP request body (JSON):
  account_id   (required) — Meta ad account ID, with or without "act_" prefix
  date_start   (optional) — ISO date YYYY-MM-DD; overrides lookback window
  date_end     (optional) — ISO date YYYY-MM-DD; defaults to yesterday

Usage as Cloud Function:
  POST https://<function-url>
  Content-Type: application/json
  {"account_id": "123456789"}
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, timedelta

import functions_framework
from facebook_business.api import FacebookAdsApi
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.campaign import Campaign
from facebook_business.adobjects.adset import AdSet
from facebook_business.adobjects.ad import Ad
from google.cloud import bigquery

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

GCP_PROJECT = os.environ["GCP_PROJECT"]
META_DATASET = os.environ.get("META_DATASET", "meta_data")
LOOKBACK_DAYS = int(os.environ.get("META_LOOKBACK_DAYS", "30"))
ACCESS_TOKEN = os.environ.get("META_ACCESS_TOKEN", "")

BQ_CLIENT: bigquery.Client | None = None


def _bq() -> bigquery.Client:
    global BQ_CLIENT
    if BQ_CLIENT is None:
        BQ_CLIENT = bigquery.Client(project=GCP_PROJECT)
    return BQ_CLIENT


def _table_ref(table_name: str) -> str:
    return f"{GCP_PROJECT}.{META_DATASET}.{table_name}"


# ---------------------------------------------------------------------------
# Extractors
# ---------------------------------------------------------------------------

def _extract_campaigns(account: AdAccount) -> list[dict]:
    fields = [
        Campaign.Field.id,
        Campaign.Field.name,
        Campaign.Field.status,
        Campaign.Field.objective,
        Campaign.Field.bid_strategy,
        Campaign.Field.daily_budget,
        Campaign.Field.lifetime_budget,
        Campaign.Field.start_time,
        Campaign.Field.stop_time,
        Campaign.Field.account_id,
        Campaign.Field.created_time,
        Campaign.Field.updated_time,
    ]
    campaigns = account.get_campaigns(fields=fields, params={"limit": 500})
    rows = []
    for c in campaigns:
        rows.append({
            "id": c.get("id"),
            "name": c.get("name"),
            "status": c.get("status"),
            "objective": c.get("objective"),
            "bid_strategy": c.get("bid_strategy"),
            "daily_budget": _safe_float(c.get("daily_budget")),
            "lifetime_budget": _safe_float(c.get("lifetime_budget")),
            "start_time": c.get("start_time"),
            "stop_time": c.get("stop_time"),
            "account_id": c.get("account_id"),
            "created_time": c.get("created_time"),
            "updated_time": c.get("updated_time"),
        })
    logger.info("Fetched %d campaigns", len(rows))
    return rows


def _extract_adsets(account: AdAccount) -> list[dict]:
    fields = [
        AdSet.Field.id,
        AdSet.Field.name,
        AdSet.Field.campaign_id,
        AdSet.Field.status,
        AdSet.Field.optimization_goal,
        AdSet.Field.billing_event,
        AdSet.Field.bid_amount,
        AdSet.Field.daily_budget,
        AdSet.Field.lifetime_budget,
        AdSet.Field.start_time,
        AdSet.Field.end_time,
        AdSet.Field.targeting,
        AdSet.Field.destination_type,
        AdSet.Field.account_id,
    ]
    adsets = account.get_ad_sets(fields=fields, params={"limit": 500})
    rows = []
    for a in adsets:
        targeting = a.get("targeting") or {}
        rows.append({
            "id": a.get("id"),
            "name": a.get("name"),
            "campaign_id": a.get("campaign_id"),
            "status": a.get("status"),
            "optimization_goal": a.get("optimization_goal"),
            "billing_event": a.get("billing_event"),
            "bid_amount": _safe_float(a.get("bid_amount")),
            "daily_budget": _safe_float(a.get("daily_budget")),
            "lifetime_budget": _safe_float(a.get("lifetime_budget")),
            "start_time": a.get("start_time"),
            "end_time": a.get("end_time"),
            "destination_type": a.get("destination_type"),
            "account_id": a.get("account_id"),
            "geo_locations": json.dumps(targeting.get("geo_locations", {})),
            "age_min": targeting.get("age_min"),
            "age_max": targeting.get("age_max"),
            "genders": json.dumps(targeting.get("genders", [])),
            "custom_audiences": json.dumps(targeting.get("custom_audiences", [])),
            "excluded_custom_audiences": json.dumps(targeting.get("excluded_custom_audiences", [])),
            "flexible_spec": json.dumps(targeting.get("flexible_spec", [])),
            "excluded_connections": json.dumps(targeting.get("excluded_connections", [])),
        })
    logger.info("Fetched %d ad sets", len(rows))
    return rows


def _extract_ads(account: AdAccount) -> list[dict]:
    fields = [
        Ad.Field.id,
        Ad.Field.name,
        Ad.Field.adset_id,
        Ad.Field.campaign_id,
        Ad.Field.status,
        Ad.Field.creative,
        Ad.Field.account_id,
        Ad.Field.created_time,
        Ad.Field.updated_time,
    ]
    ads = account.get_ads(fields=fields, params={"limit": 500})
    rows = []
    for a in ads:
        creative = a.get("creative") or {}
        rows.append({
            "id": a.get("id"),
            "name": a.get("name"),
            "adset_id": a.get("adset_id"),
            "campaign_id": a.get("campaign_id"),
            "status": a.get("status"),
            "creative_id": creative.get("id"),
            "account_id": a.get("account_id"),
            "created_time": a.get("created_time"),
            "updated_time": a.get("updated_time"),
        })
    logger.info("Fetched %d ads", len(rows))
    return rows


def _extract_insights_window(
    account: AdAccount,
    since: str,
    until: str,
) -> list[dict]:
    """Fetch campaign-level daily insights for a single 7-day window."""
    fields = [
        "campaign_id",
        "campaign_name",
        "adset_id",
        "adset_name",
        "date_start",
        "date_stop",
        "impressions",
        "clicks",
        "reach",
        "spend",
        "cpc",
        "cpm",
        "ctr",
        "cpp",
        "frequency",
        "unique_clicks",
        "unique_ctr",
        "actions",
        "conversions",
        "purchase_roas",
        "website_purchase_roas",
        "cost_per_action_type",
        "video_30_sec_watched_actions",
        "video_p100_watched_actions",
        "outbound_clicks",
    ]
    params = {
        "time_range": {"since": since, "until": until},
        "time_increment": 1,
        "level": "adset",
        "limit": 500,
    }
    rows = []
    try:
        insights = account.get_insights(fields=fields, params=params)
        for ins in insights:
            actions = {a["action_type"]: float(a["value"]) for a in (ins.get("actions") or [])}
            roas_list = ins.get("purchase_roas") or ins.get("website_purchase_roas") or []
            roas = float(roas_list[0]["value"]) if roas_list else None

            rows.append({
                "date_start": ins.get("date_start"),
                "date_stop": ins.get("date_stop"),
                "campaign_id": ins.get("campaign_id"),
                "campaign_name": ins.get("campaign_name"),
                "adset_id": ins.get("adset_id"),
                "adset_name": ins.get("adset_name"),
                "impressions": _safe_int(ins.get("impressions")),
                "clicks": _safe_int(ins.get("clicks")),
                "reach": _safe_int(ins.get("reach")),
                "spend": _safe_float(ins.get("spend")),
                "cpc": _safe_float(ins.get("cpc")),
                "cpm": _safe_float(ins.get("cpm")),
                "ctr": _safe_float(ins.get("ctr")),
                "frequency": _safe_float(ins.get("frequency")),
                "unique_clicks": _safe_int(ins.get("unique_clicks")),
                "purchase_roas": roas,
                "conversions": _safe_float(ins.get("conversions")),
                "link_clicks": actions.get("link_click"),
                "landing_page_views": actions.get("landing_page_view"),
                "purchases": actions.get("purchase"),
                "leads": actions.get("lead"),
                "add_to_cart": actions.get("add_to_cart"),
                "initiate_checkout": actions.get("initiate_checkout"),
                "complete_registration": actions.get("complete_registration"),
            })
    except Exception as exc:
        logger.warning("Insights fetch failed for window %s–%s: %s", since, until, exc)
    return rows


def _extract_custom_audiences(account: AdAccount) -> list[dict]:
    fields = [
        "id",
        "name",
        "subtype",
        "approximate_count_upper_bound",
        "description",
        "customer_file_source",
        "data_source",
        "lookalike_spec",
        "retention_days",
        "account_id",
    ]
    audiences = account.get_custom_audiences(fields=fields, params={"limit": 200})
    rows = []
    for a in audiences:
        data_source = a.get("data_source") or {}
        lookalike_spec = a.get("lookalike_spec") or {}
        rows.append({
            "id": a.get("id"),
            "name": a.get("name"),
            "subtype": a.get("subtype"),
            "approximate_count": a.get("approximate_count_upper_bound"),
            "description": a.get("description"),
            "customer_file_source": a.get("customer_file_source"),
            "data_source_type": data_source.get("type"),
            "is_lookalike": bool(lookalike_spec),
            "lookalike_country": lookalike_spec.get("country"),
            "lookalike_ratio": _safe_float(lookalike_spec.get("ratio")),
            "retention_days": a.get("retention_days"),
            "account_id": a.get("account_id"),
        })
    logger.info("Fetched %d custom audiences", len(rows))
    return rows


# ---------------------------------------------------------------------------
# BigQuery writer
# ---------------------------------------------------------------------------

def _write_bq(table_name: str, rows: list[dict], write_mode: str = "WRITE_TRUNCATE") -> None:
    if not rows:
        logger.info("No rows to write for table %s", table_name)
        return

    table_ref = _table_ref(table_name)
    job_config = bigquery.LoadJobConfig(
        write_disposition=write_mode,
        autodetect=True,
        source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
    )
    job = _bq().load_table_from_json(rows, table_ref, job_config=job_config)
    job.result()
    logger.info("Wrote %d rows to %s (%s)", len(rows), table_ref, write_mode)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _safe_float(v) -> float | None:
    try:
        return float(v) if v is not None else None
    except (ValueError, TypeError):
        return None


def _safe_int(v) -> int | None:
    try:
        return int(v) if v is not None else None
    except (ValueError, TypeError):
        return None


def _date_chunks(start: date, end: date, chunk_days: int = 7):
    """Yield (since, until) string pairs in chunk_days windows."""
    cursor = start
    while cursor <= end:
        window_end = min(cursor + timedelta(days=chunk_days - 1), end)
        yield cursor.isoformat(), window_end.isoformat()
        cursor = window_end + timedelta(days=1)


# ---------------------------------------------------------------------------
# Cloud Function entry point
# ---------------------------------------------------------------------------

@functions_framework.http
def run_extraction(request):
    """HTTP Cloud Function entry point."""
    try:
        body = request.get_json(silent=True) or {}
    except Exception:
        body = {}

    account_id = body.get("account_id") or os.environ.get("META_ACCOUNT_ID", "")
    if not account_id:
        return (json.dumps({"error": "account_id is required"}), 400, {"Content-Type": "application/json"})

    # Normalise: Facebook expects "act_XXXXXXXXX"
    if not account_id.startswith("act_"):
        account_id = f"act_{account_id}"

    access_token = body.get("access_token") or ACCESS_TOKEN
    if not access_token:
        return (json.dumps({"error": "META_ACCESS_TOKEN env var or access_token body param required"}), 400, {"Content-Type": "application/json"})

    yesterday = date.today() - timedelta(days=1)
    lookback = int(body.get("lookback_days", LOOKBACK_DAYS))
    date_end = date.fromisoformat(body["date_end"]) if "date_end" in body else yesterday
    date_start = date.fromisoformat(body["date_start"]) if "date_start" in body else (date_end - timedelta(days=lookback - 1))

    logger.info(
        "Starting extraction: account=%s, %s → %s",
        account_id, date_start.isoformat(), date_end.isoformat(),
    )

    FacebookAdsApi.init(access_token=access_token)
    account = AdAccount(account_id)

    summary: dict[str, int] = {}

    # Entity tables — fresh snapshot each run
    campaigns = _extract_campaigns(account)
    _write_bq("campaigns", campaigns, "WRITE_TRUNCATE")
    summary["campaigns"] = len(campaigns)

    adsets = _extract_adsets(account)
    _write_bq("adsets", adsets, "WRITE_TRUNCATE")
    summary["adsets"] = len(adsets)

    ads = _extract_ads(account)
    _write_bq("ads", ads, "WRITE_TRUNCATE")
    summary["ads"] = len(ads)

    custom_audiences = _extract_custom_audiences(account)
    _write_bq("custom_audiences", custom_audiences, "WRITE_TRUNCATE")
    summary["custom_audiences"] = len(custom_audiences)

    # Insights — append daily rows, deduplicated by (date_start, adset_id) in BQ views
    all_insights: list[dict] = []
    for since, until in _date_chunks(date_start, date_end, chunk_days=7):
        logger.info("Fetching insights %s → %s", since, until)
        chunk = _extract_insights_window(account, since, until)
        all_insights.extend(chunk)
        logger.info("  → %d rows", len(chunk))

    _write_bq("adinsights", all_insights, "WRITE_TRUNCATE")
    summary["adinsights"] = len(all_insights)

    logger.info("Extraction complete: %s", summary)
    return (json.dumps({"status": "ok", "rows": summary}), 200, {"Content-Type": "application/json"})


# ---------------------------------------------------------------------------
# Local runner
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys

    # Usage: python main.py <account_id> [date_start] [date_end]
    # Example (one week): python main.py 123456789 2026-05-12 2026-05-18
    account_id = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("META_ACCOUNT_ID", "")
    if not account_id:
        print("Usage: python main.py <account_id> [date_start YYYY-MM-DD] [date_end YYYY-MM-DD]")
        sys.exit(1)

    body: dict = {"account_id": account_id}
    if len(sys.argv) > 2:
        body["date_start"] = sys.argv[2]
    if len(sys.argv) > 3:
        body["date_end"] = sys.argv[3]
    # Default to last 7 days when no dates given on CLI
    if "date_start" not in body and "date_end" not in body:
        body["lookback_days"] = 7

    class _FakeRequest:
        def get_json(self, silent=False):
            return body

    result, code, _ = run_extraction(_FakeRequest())
    print(f"HTTP {code}: {result}")
