-- Post-run checks for the anonymizer. Run after a job run:
--   bq query --use_legacy_sql=false < anonymizer/verify.sql
-- Both result sets should be EMPTY. They only ever print table/column names and
-- counts, never client values.

DECLARE leak_sql STRING;
DECLARE terms_re STRING;

-- 1. Row counts must match between google_ads and anonymized_data.
WITH src AS (
  SELECT table_id AS table_name, row_count
  FROM `paid-media-2a86.google_ads.__TABLES__`
),
dst AS (
  SELECT table_id AS table_name, row_count
  FROM `paid-media-2a86.anonymized_data.__TABLES__`
)
SELECT 'row_count' AS check_name, s.table_name, s.row_count AS source_rows, d.row_count AS anonymized_rows
FROM src s
LEFT JOIN dst d USING (table_name)
WHERE d.row_count IS NULL OR d.row_count != s.row_count;

-- 2. Leak check: any sensitive term still present in a STRING column of
--    anonymized_data? Builds one query per string column; prints the offenders.
SET terms_re = (
  SELECT CONCAT(r'(?i)(^|[^\p{L}\p{N}])(', STRING_AGG(REGEXP_REPLACE(term, r'([.*+?^${}()|\[\]\\])', r'\\\1'), '|'), r')($|[^\p{L}\p{N}])')
  FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms`
);

SET leak_sql = (
  SELECT STRING_AGG(
    FORMAT('SELECT "leak" AS check_name, %T AS table_name, %T AS column_name, COUNT(*) AS leaking_rows FROM `paid-media-2a86.anonymized_data.%s` WHERE REGEXP_CONTAINS(TO_JSON_STRING(`%s`), %T) HAVING COUNT(*) > 0',
           table_name, column_name, table_name, column_name, terms_re),
    ' UNION ALL ')
  FROM `paid-media-2a86.anonymized_data.INFORMATION_SCHEMA.COLUMNS`
  WHERE data_type IN ('STRING', 'ARRAY<STRING>')
);

IF leak_sql IS NOT NULL THEN
  EXECUTE IMMEDIATE leak_sql;
END IF;
