-- Helper for finding brand terms to add to _anon_sensitive_terms.
-- Run it yourself and review the output: it shows REAL client data, so keep the
-- result out of AI assistants. Run with:
--   bq query --use_legacy_sql=false < anonymizer/discover_terms.sql
--
-- Lists the most frequent word tokens in campaign names and account names.
-- Brand/product names tend to show up with high counts; generic taxonomy
-- (FR, GOO, Search, ...) will too, so just pick the client-identifying ones.

WITH names AS (
  SELECT 'campaign' AS source, CAMPAIGN_NAME AS name
  FROM `paid-media-2a86.google_ads.GOOGLEADS_CAMPAIGNMETADATA`
  UNION ALL
  SELECT 'account', PROFILE
  FROM `paid-media-2a86.google_ads.GOOGLEADS_CUSTOMERMETADATA`
)
SELECT
  UPPER(tok) AS token,
  COUNT(*) AS occurrences,
  COUNT(DISTINCT source) AS in_sources,
  ARRAY_AGG(DISTINCT source) AS sources
FROM names, UNNEST(REGEXP_EXTRACT_ALL(name, r'[\p{L}\p{N}]+')) AS tok
WHERE LENGTH(tok) >= 2
GROUP BY token
ORDER BY occurrences DESC
LIMIT 300;
