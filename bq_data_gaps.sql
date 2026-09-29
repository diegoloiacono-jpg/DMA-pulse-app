-- =============================================================================
-- DMA Pulse — Google Ads BigQuery data gaps
-- Dataset: paid-media-2a86.google_ads   (Supermetrics Google Ads connector)
-- Verified against live data on 2026-08-17.
--
-- Context: DMA Pulse scores 7 audit categories off this dataset. The queries
-- below isolate the fields that are still missing or unusable, and which audit
-- topic each one blocks. Each query is self-contained — run as-is.
--
-- BLOCKER (not covered below, flagged separately): account identity changed.
-- ACCOUNT_ID no longer exists in any of the 13 tables; PROFILE_ID replaced it.
-- See Q5 for proof. This is handled on our side.
-- =============================================================================


-- =============================================================================
-- Q1. RESPONSIVE SEARCH AD CREATIVE TEXT IS EMPTY
--
-- Blocks audit topics: "Headline / description variety", "Ad copy relevance"
--
-- Expected: every enabled RSA exposes its headline + description text.
-- Actual:   all 10 text columns are NULL/'' for 100% of RSAs, in all 5 accounts
--           (1,816 RSAs total). The control columns (FINAL_URL,
--           AD_APPROVAL_STATUS) DO populate on the same rows, so the rows
--           themselves are arriving fine — only the creative text is absent.
--
-- Note the contrast with "Expanded dynamic search ad", where DESCRIPTION_1 and
-- DESCRIPTION_2 ARE populated. So the pipeline can deliver description text for
-- one ad type but not for RSAs — this looks like a Supermetrics report field
-- selection issue rather than a Google Ads API limitation.
-- =============================================================================
SELECT
  ACCOUNT_NAME,
  AD_TYPE,
  COUNT(DISTINCT AD_ID)                                                   AS ads,
  COUNT(DISTINCT IF(COALESCE(HEADLINE,        '') != '', AD_ID, NULL))    AS with_headline,
  COUNT(DISTINCT IF(COALESCE(HEADLINE_PART_1, '') != '', AD_ID, NULL))    AS with_headline_part_1,
  COUNT(DISTINCT IF(COALESCE(HEADLINE_PART_2, '') != '', AD_ID, NULL))    AS with_headline_part_2,
  COUNT(DISTINCT IF(COALESCE(HEADLINE_PART_3, '') != '', AD_ID, NULL))    AS with_headline_part_3,
  COUNT(DISTINCT IF(COALESCE(LONG_HEADLINE,   '') != '', AD_ID, NULL))    AS with_long_headline,
  COUNT(DISTINCT IF(COALESCE(SHORT_HEADLINE,  '') != '', AD_ID, NULL))    AS with_short_headline,
  COUNT(DISTINCT IF(COALESCE(DESCRIPTION,     '') != '', AD_ID, NULL))    AS with_description,
  COUNT(DISTINCT IF(COALESCE(DESCRIPTION_1,   '') != '', AD_ID, NULL))    AS with_description_1,
  COUNT(DISTINCT IF(COALESCE(DESCRIPTION_2,   '') != '', AD_ID, NULL))    AS with_description_2,
  -- control columns: these DO populate, proving the rows themselves are fine
  COUNT(DISTINCT IF(COALESCE(FINAL_URL,          '') != '', AD_ID, NULL)) AS ctrl_with_final_url,
  COUNT(DISTINCT IF(COALESCE(AD_APPROVAL_STATUS, '') != '', AD_ID, NULL)) AS ctrl_with_approval_status
FROM `paid-media-2a86.google_ads.GOOGLEADS_AD`
WHERE UPPER(REPLACE(AD_TYPE, ' ', '_')) IN ('RESPONSIVE_SEARCH_AD', 'EXPANDED_DYNAMIC_SEARCH_AD')
GROUP BY ACCOUNT_NAME, AD_TYPE
ORDER BY ads DESC;


-- =============================================================================
-- Q2. AUDIT-CRITICAL FIELDS THAT EXIST NOWHERE IN THE DATASET
--
-- Each row is a field DMA Pulse needs, with the audit topic it feeds.
-- found_in_tables = 0 means the field is absent from all 13 tables, so that
-- topic cannot be scored automatically and falls back to a manual stub.
--
-- Actual: all 16 return 0. Highest priority for us are AD_STRENGTH,
-- TARGET_ROAS and TARGET_CPA — those three alone block 4 audit topics.
-- =============================================================================
WITH expected AS (
  SELECT * FROM UNNEST([
    STRUCT('AD_STRENGTH'           AS pattern, 'Ad strength (RSA + PMax asset group quality)' AS needed_for),
    ('TARGET_ROAS',            'Target ROAS value per campaign (vs. actual ROAS)'),
    ('TARGET_CPA',             'Target CPA value per campaign (vs. actual CPA)'),
    ('HOUR%',                  'Hour-of-day stats -> ad scheduling / dayparting'),
    ('%DAY_OF_WEEK%',          'Day-of-week stats -> ad scheduling / dayparting'),
    ('AD_SCHEDULE%',           'Ad schedule criteria -> dayparting'),
    ('AD_GROUP_TYPE',          'Ad group type -> DSA / dynamic ad group detection'),
    ('%SERVING_STATUS%',       'Keyword serving status (RARELY_SERVED / BELOW_FIRST_PAGE_BID)'),
    ('%PRIMARY_FOR_GOAL%',     'Conversion action primary-vs-secondary goal flag'),
    ('%ATTRIBUTION%',          'Conversion attribution model'),
    ('%COUNTING_TYPE%',        'Conversion counting type (one / every)'),
    ('%GEO_TARGET_TYPE%',      'Geo presence-vs-interest targeting mode'),
    ('%PRODUCT_GROUP%',        'Shopping product group / partition structure'),
    ('%RECOMMENDED_BUDGET%',   'Budget recommendation flag -> budget allocation'),
    ('%SHARED_SET%',           'Shared negative keyword lists'),
    ('%IMPRESSION_SHARE_LOST%','Impression share lost to budget vs. rank')
  ])
)
SELECT
  e.pattern              AS expected_field,
  e.needed_for,
  COUNT(c.column_name)   AS found_in_tables,
  IFNULL(STRING_AGG(DISTINCT c.table_name, ', ' ORDER BY c.table_name), '(none)') AS present_in
FROM expected e
LEFT JOIN `paid-media-2a86.google_ads`.INFORMATION_SCHEMA.COLUMNS c
       ON UPPER(c.column_name) LIKE e.pattern
GROUP BY e.pattern, e.needed_for
ORDER BY found_in_tables ASC, expected_field;


-- =============================================================================
-- Q3. COLUMNS THAT EXIST BUT CARRY NO SIGNAL (single value across every row)
--
-- Blocks audit topics: "Negative keyword coverage", "Exclusion lists",
--                      "Campaign status hygiene", "Keyword status hygiene",
--                      "Budget allocation"
--
-- These columns are in the schema, so they look healthy, but every row holds
-- the same value — nothing can be detected from them.
--
-- Actual:
--   IS_NEGATIVE      = false on all 49,987 rows  -> no negative keywords at all
--   KEYWORD_STATUS   = 'enabled' only            -> no paused/removed keywords
--   AD_GROUP_STATUS  = 'enabled' only
--   CAMPAIGN_STATUS  = 'enabled' only            -> no paused/removed campaigns
--   AD_STATUS        = 'Enabled' only
--   TOTAL_BUDGET     = NULL on all 1,270 rows
--   BIDDING_STRATEGY = populated on only 60 of 1,270 rows (3 of 5 accounts)
--
-- Question for the engineer: are paused/removed entities and negative keywords
-- being filtered out of the export? The audit needs them to assess account
-- hygiene — "no paused campaigns" and "paused campaigns not exported" are
-- indistinguishable from our side.
-- =============================================================================
SELECT 'GOOGLEADS_KEYWORD'  AS source_table, 'IS_NEGATIVE'     AS column_name,
       CAST(IS_NEGATIVE AS STRING) AS observed_value,
       COUNT(*) AS row_count, COUNT(DISTINCT ACCOUNT_NAME) AS accounts
FROM `paid-media-2a86.google_ads.GOOGLEADS_KEYWORD` GROUP BY observed_value

UNION ALL
SELECT 'GOOGLEADS_KEYWORD', 'KEYWORD_STATUS', KEYWORD_STATUS,
       COUNT(*), COUNT(DISTINCT ACCOUNT_NAME)
FROM `paid-media-2a86.google_ads.GOOGLEADS_KEYWORD` GROUP BY KEYWORD_STATUS

UNION ALL
SELECT 'GOOGLEADS_KEYWORD', 'AD_GROUP_STATUS', AD_GROUP_STATUS,
       COUNT(*), COUNT(DISTINCT ACCOUNT_NAME)
FROM `paid-media-2a86.google_ads.GOOGLEADS_KEYWORD` GROUP BY AD_GROUP_STATUS

UNION ALL
SELECT 'GOOGLEADS_CAMPAIGN', 'CAMPAIGN_STATUS', CAMPAIGN_STATUS,
       COUNT(*), COUNT(DISTINCT ACCOUNT_NAME)
FROM `paid-media-2a86.google_ads.GOOGLEADS_CAMPAIGN` GROUP BY CAMPAIGN_STATUS

UNION ALL
SELECT 'GOOGLEADS_AD', 'AD_STATUS', AD_STATUS,
       COUNT(*), COUNT(DISTINCT ACCOUNT_NAME)
FROM `paid-media-2a86.google_ads.GOOGLEADS_AD` GROUP BY AD_STATUS

UNION ALL
SELECT 'GOOGLEADS_CAMPAIGN', 'TOTAL_BUDGET',
       IF(TOTAL_BUDGET IS NULL, 'NULL', 'populated'),
       COUNT(*), COUNT(DISTINCT ACCOUNT_NAME)
FROM `paid-media-2a86.google_ads.GOOGLEADS_CAMPAIGN` GROUP BY 3

UNION ALL
SELECT 'GOOGLEADS_CAMPAIGN', 'BIDDING_STRATEGY',
       IF(COALESCE(BIDDING_STRATEGY,'') = '', 'NULL/empty', 'populated'),
       COUNT(*), COUNT(DISTINCT ACCOUNT_NAME)
FROM `paid-media-2a86.google_ads.GOOGLEADS_CAMPAIGN` GROUP BY 3

ORDER BY source_table, column_name, row_count DESC;


-- =============================================================================
-- Q4. DATE COVERAGE GAPS — missing days inside each table's own date range
--
-- Affects audit topics: "Data density", "Target stability", and any
-- trend/consistency logic.
--
-- Expected: a continuous daily series covering at least the 30-day audit
--           lookback window.
-- Actual:   history starts 2026-07-31 (only ~12 usable days), and 6 days are
--           missing from every table: 2026-08-08 and 2026-08-11 .. 2026-08-15
--           (5 consecutive days). GOOGLEADS_PLACEMENT is missing 8 days.
--
-- The 5-day consecutive hole looks like a backfill that did not complete.
-- Two asks: (1) fill the gap, (2) extend history to 90+ days so the 30-day
-- lookback has full coverage and we can compare periods.
-- =============================================================================
WITH bounds AS (
  SELECT MIN(DATE) AS min_d, MAX(DATE) AS max_d
  FROM `paid-media-2a86.google_ads.GOOGLEADS_CAMPAIGN`
),
calendar AS (
  SELECT d FROM bounds, UNNEST(GENERATE_DATE_ARRAY(min_d, max_d)) AS d
),
per_table AS (
  SELECT 'GOOGLEADS_AD' AS source_table, DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_AD`
  UNION ALL SELECT 'GOOGLEADS_AGE',          DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_AGE`
  UNION ALL SELECT 'GOOGLEADS_AI_MAX',       DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_AI_MAX`
  UNION ALL SELECT 'GOOGLEADS_AUDIENCE',     DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_AUDIENCE`
  UNION ALL SELECT 'GOOGLEADS_CAMPAIGN',     DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_CAMPAIGN`
  UNION ALL SELECT 'GOOGLEADS_CONVERSION',   DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_CONVERSION`
  UNION ALL SELECT 'GOOGLEADS_GENDER',       DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_GENDER`
  UNION ALL SELECT 'GOOGLEADS_GEO',          DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_GEO`
  UNION ALL SELECT 'GOOGLEADS_KEYWORD',      DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_KEYWORD`
  UNION ALL SELECT 'GOOGLEADS_PLACEMENT',    DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_PLACEMENT`
  UNION ALL SELECT 'GOOGLEADS_SEARCH_QUERY', DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_SEARCH_QUERY`
  UNION ALL SELECT 'GOOGLEADS_SHOPPING',     DATE FROM `paid-media-2a86.google_ads.GOOGLEADS_SHOPPING`
),
tables AS (SELECT DISTINCT source_table FROM per_table),
present AS (SELECT source_table, DATE AS d, COUNT(*) AS c FROM per_table GROUP BY 1, 2)
SELECT
  t.source_table,
  MIN(cal.d)                                       AS range_start,
  MAX(cal.d)                                       AS range_end,
  COUNT(*)                                         AS days_in_range,
  COUNTIF(p.d IS NOT NULL)                         AS days_with_data,
  COUNTIF(p.d IS NULL)                             AS days_missing,
  STRING_AGG(IF(p.d IS NULL, FORMAT_DATE('%Y-%m-%d', cal.d), NULL), ', ' ORDER BY cal.d) AS missing_days
FROM tables t
CROSS JOIN calendar cal
LEFT JOIN present p ON p.source_table = t.source_table AND p.d = cal.d
GROUP BY t.source_table
ORDER BY days_missing DESC, t.source_table;


-- =============================================================================
-- Q5. PER-TABLE FIELD MATRIX — conversion metrics, date column, join keys
--
-- Blocks audit topics: "Product feed completeness", "Feed segmentation",
--                      "Shopping campaign structure", "Asset group strength"
--
-- Three problems visible in one grid:
--
--  1. GOOGLEADS_SHOPPING is the ONLY table with no CONVERSIONS /
--     CONVERSION_VALUE. It has COST, CLICKS and IMPRESSIONS, so we can see
--     Shopping spend but cannot compute Shopping ROAS or conversion rate at
--     product level. This is the single most valuable field to add.
--
--  2. GOOGLEADS_PMAX has no DATE column at all, so it cannot be filtered to
--     the audit lookback window — it is an unwindowed snapshot of unknown
--     vintage. Please add DATE.
--
--  3. ACCOUNT_ID is absent from all 13 tables (PROFILE_ID replaced it), and
--     CAMPAIGN_ID is missing from GEO, KEYWORD, PLACEMENT and PMAX — those
--     four can only be joined by CAMPAIGN_NAME, which is fragile across
--     blended accounts. Adding CAMPAIGN_ID to those four would help.
-- =============================================================================
SELECT
  t.table_name,
  MAX(IF(UPPER(c.column_name) = 'DATE',              'yes', NULL)) AS has_date,
  MAX(IF(UPPER(c.column_name) = 'CONVERSIONS',       'yes', NULL)) AS has_conversions,
  MAX(IF(UPPER(c.column_name) = 'CONVERSION_VALUE',  'yes', NULL)) AS has_conversion_value,
  MAX(IF(UPPER(c.column_name) = 'CLICKS',            'yes', NULL)) AS has_clicks,
  MAX(IF(UPPER(c.column_name) = 'IMPRESSIONS',       'yes', NULL)) AS has_impressions,
  MAX(IF(UPPER(c.column_name) = 'COST',              'yes', NULL)) AS has_cost,
  MAX(IF(UPPER(c.column_name) = 'COST_EUR',          'yes', NULL)) AS has_cost_eur,
  MAX(IF(UPPER(c.column_name) = 'ACCOUNT_ID',        'yes', NULL)) AS has_account_id,
  MAX(IF(UPPER(c.column_name) = 'PROFILE_ID',        'yes', NULL)) AS has_profile_id,
  MAX(IF(UPPER(c.column_name) = 'CAMPAIGN_ID',       'yes', NULL)) AS has_campaign_id
FROM `paid-media-2a86.google_ads`.INFORMATION_SCHEMA.TABLES t
LEFT JOIN `paid-media-2a86.google_ads`.INFORMATION_SCHEMA.COLUMNS c
       ON c.table_name = t.table_name
GROUP BY t.table_name
ORDER BY t.table_name;
