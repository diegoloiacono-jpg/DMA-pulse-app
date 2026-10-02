-- DMA Pulse anonymizer — one-time setup (idempotent; safe to re-run).
-- deploy.sh substitutes __LOCATION__ with the location of the google_ads dataset.

CREATE SCHEMA IF NOT EXISTS `paid-media-2a86.anonymized_data`
  OPTIONS (location = '__LOCATION__', description = 'Anonymized copy of google_ads. Rebuilt by the scheduled anonymizer.');

-- Holds the de-anonymization key. Keep access to this dataset restricted.
CREATE SCHEMA IF NOT EXISTS `paid-media-2a86.anonymization_keys`
  OPTIONS (location = '__LOCATION__', description = 'Mapping tables for the anonymizer. RESTRICTED: lets you reverse the anonymization.');

-- Terms that identify the client (account names, brand names). Seeded from
-- account names by the job; add brand terms by hand:
--   INSERT INTO `paid-media-2a86.anonymization_keys._anon_sensitive_terms` (term, entity_type, source, first_seen_at)
--   VALUES ('ACME', 'BRAND', 'manual', CURRENT_TIMESTAMP());
-- Leave anonymized_value NULL: the job assigns brand001, brand002, ... itself.
CREATE TABLE IF NOT EXISTS `paid-media-2a86.anonymization_keys._anon_sensitive_terms` (
  term STRING NOT NULL,            -- stored UPPER-cased; matched case-insensitively
  entity_type STRING NOT NULL,     -- ACCOUNT | ACCOUNT_TOKEN | BRAND
  anonymized_value STRING,         -- assigned once, never changed
  source STRING,                   -- auto | manual
  first_seen_at TIMESTAMP
);

-- Remapped account-level identifiers (PROFILE_ID, MERCHANT_ID).
CREATE TABLE IF NOT EXISTS `paid-media-2a86.anonymization_keys._anon_mapping` (
  entity_type STRING NOT NULL,     -- ACCOUNT_ID | MERCHANT_ID | <column name for custom ID overrides>
  original_value STRING NOT NULL,
  anonymized_value STRING NOT NULL,
  first_seen_at TIMESTAMP
);

-- Optional per-column overrides. treatment: KEEP | TERMS | ID | EXCLUDE
-- Use column_name = '*' with EXCLUDE to skip a whole table.
CREATE TABLE IF NOT EXISTS `paid-media-2a86.anonymization_keys._anon_column_config` (
  table_name STRING NOT NULL,
  column_name STRING NOT NULL,
  treatment STRING NOT NULL
);

-- What the last successful run loaded per table; lets the job skip unchanged
-- tables and reload only changed date partitions.
CREATE TABLE IF NOT EXISTS `paid-media-2a86.anonymization_keys._anon_run_state` (
  table_name STRING NOT NULL,
  source_modified TIMESTAMP,
  config_hash STRING,
  rebuilt_at TIMESTAMP
);

-- Words from account names that must NOT be treated as client-identifying
-- (generic words, markets, ...). Add to it if the job over-anonymizes.
CREATE TABLE IF NOT EXISTS `paid-media-2a86.anonymization_keys._anon_term_stoplist` (term STRING NOT NULL);

INSERT INTO `paid-media-2a86.anonymization_keys._anon_term_stoplist` (term)
SELECT term FROM UNNEST([
  'BRAND', 'ACCOUNT', 'GOOGLE', 'ADS', 'SEARCH', 'DISPLAY', 'VIDEO', 'SHOPPING', 'YOUTUBE',
  'PERFORMANCE', 'GLOBAL', 'DIGITAL', 'MEDIA', 'PAID', 'MARKET', 'EUROPE', 'GROUP', 'TEST',
  'FRANCE', 'GERMANY', 'SPAIN', 'ITALY', 'BELGIUM', 'NETHERLANDS', 'SWITZERLAND', 'AUSTRIA',
  'SWEDEN', 'DENMARK', 'NORWAY', 'POLAND', 'CANADA', 'AUSTRALIA'
]) AS term
WHERE term NOT IN (SELECT term FROM `paid-media-2a86.anonymization_keys._anon_term_stoplist`);

-- Replaces every listed term inside a string, case-insensitively, on word
-- boundaries (so "acme" matches in "ACME_FR", "www.acme.com" but not in "acmex").
-- `dict` is a JSON object {"TERM": "token", ...}. Terms are matched longest-first.
CREATE OR REPLACE FUNCTION `paid-media-2a86.anonymization_keys.anon_text`(s STRING, dict STRING)
RETURNS STRING
LANGUAGE js AS r"""
  if (s === null || !dict) return s;
  var g = globalThis;
  if (g.__anon_src !== dict) {
    var m = JSON.parse(dict);
    var keys = Object.keys(m).sort(function (a, b) { return b.length - a.length; });
    var esc = function (t) { return t.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); };
    g.__anon_map = m;
    // BigQuery's JS engine has no \p{...} support, so spell out letters/digits
    // (ASCII + Latin-1/Extended accents). "_" is deliberately not a word char.
    var w = 'A-Za-z0-9\\u00C0-\\u024F';
    g.__anon_re = keys.length
      ? new RegExp('(?<![' + w + '])(?:' + keys.map(esc).join('|') + ')(?![' + w + '])', 'gi')
      : null;
    g.__anon_src = dict;
  }
  if (!g.__anon_re) return s;
  return s.replace(g.__anon_re, function (match) {
    var t = g.__anon_map[match.toUpperCase()];
    return t === undefined ? match : t;
  });
""";

-- Human-readable lookup: what does each anonymized value belong to?
CREATE OR REPLACE VIEW `paid-media-2a86.anonymization_keys.v_anon_lookup` AS
SELECT entity_type, term AS original_value, anonymized_value, source, first_seen_at
FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms`
UNION ALL
SELECT entity_type, original_value, anonymized_value, 'auto', first_seen_at
FROM `paid-media-2a86.anonymization_keys._anon_mapping`;
