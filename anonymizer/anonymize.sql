-- DMA Pulse anonymizer — scheduled script.
-- Copies every base table of `google_ads` into `anonymized_data`, replacing:
--   * client-identifying terms (account names, brand terms) inside any STRING column
--   * account-level IDs (PROFILE_ID / ACCOUNT_ID / CUSTOMER_ID, MERCHANT_ID)
-- Everything else is copied unchanged. Tokens are stable: values already in the
-- mapping tables keep their token; only unseen values get a new one.
-- See anonymizer/README.md.

DECLARE src_project STRING DEFAULT 'paid-media-2a86';
DECLARE src_dataset STRING DEFAULT 'google_ads';
DECLARE dst_dataset STRING DEFAULT 'anonymized_data';
-- Table + column used to seed account names as sensitive terms.
DECLARE account_table STRING DEFAULT 'GOOGLEADS_CUSTOMERMETADATA';
DECLARE account_column STRING DEFAULT 'PROFILE';

DECLARE dict STRING;
DECLARE dict_lit STRING;
DECLARE term_count INT64;
DECLARE id_sql STRING;
DECLARE base_account INT64;
DECLARE base_brand INT64;
DECLARE pending_count INT64;
DECLARE attempt INT64 DEFAULT 0;
DECLARE n_src INT64;
DECLARE n_dst INT64;
DECLARE dst_part STRING;
DECLARE repl STRING;
DECLARE joins STRING;

-- Per-table record of what the last successful run loaded (also in setup.sql).
CREATE TABLE IF NOT EXISTS `paid-media-2a86.anonymization_keys._anon_run_state` (
  table_name STRING NOT NULL,
  source_modified TIMESTAMP,      -- source table's last_modified_time when it was loaded
  config_hash STRING,             -- hash of terms + column plan; a change forces a full rebuild
  rebuilt_at TIMESTAMP
);

-- ── 1. Sensitive terms ───────────────────────────────────────────────────────
-- Normalise manually added terms.
UPDATE `paid-media-2a86.anonymization_keys._anon_sensitive_terms`
SET term = UPPER(TRIM(term))
WHERE term != UPPER(TRIM(term));

-- Seed from account names: the full name plus its word tokens (>= 4 chars,
-- not on the stoplist). Existing terms are never touched.
EXECUTE IMMEDIATE FORMAT("""
  INSERT INTO `paid-media-2a86.anonymization_keys._anon_sensitive_terms`
    (term, entity_type, anonymized_value, source, first_seen_at)
  WITH names AS (
    SELECT DISTINCT UPPER(TRIM(`%s`)) AS name
    FROM `%s.%s.%s`
    WHERE `%s` IS NOT NULL AND TRIM(`%s`) != ''
  ),
  cand AS (
    SELECT name AS term, 'ACCOUNT' AS entity_type FROM names
    UNION ALL
    SELECT DISTINCT tok AS term, 'ACCOUNT_TOKEN' AS entity_type
    FROM names, UNNEST(REGEXP_EXTRACT_ALL(name, r'[\\p{L}\\p{N}]+')) AS tok
    WHERE LENGTH(tok) >= 4
      AND tok NOT IN (SELECT term FROM `paid-media-2a86.anonymization_keys._anon_term_stoplist`)
  )
  SELECT term, entity_type, CAST(NULL AS STRING), 'auto', CURRENT_TIMESTAMP()
  FROM cand c
  WHERE NOT EXISTS (
    SELECT 1 FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms` t WHERE t.term = c.term
  )
  QUALIFY ROW_NUMBER() OVER (PARTITION BY term ORDER BY entity_type) = 1
""", account_column, src_project, src_dataset, account_table, account_column, account_column);

-- Assign tokens (account001 / brand001, ...) to terms that don't have one yet.
SET base_account = (
  SELECT IFNULL(MAX(SAFE_CAST(REGEXP_EXTRACT(anonymized_value, r'(\d+)$') AS INT64)), 0)
  FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms`
  WHERE STARTS_WITH(anonymized_value, 'account')
);
SET base_brand = (
  SELECT IFNULL(MAX(SAFE_CAST(REGEXP_EXTRACT(anonymized_value, r'(\d+)$') AS INT64)), 0)
  FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms`
  WHERE STARTS_WITH(anonymized_value, 'brand')
);

MERGE `paid-media-2a86.anonymization_keys._anon_sensitive_terms` T
USING (
  SELECT
    term,
    IF(entity_type = 'ACCOUNT', 'account', 'brand') AS prefix,
    ROW_NUMBER() OVER (
      PARTITION BY IF(entity_type = 'ACCOUNT', 'account', 'brand')
      ORDER BY first_seen_at, term
    ) AS rn
  FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms`
  WHERE anonymized_value IS NULL
) S
ON T.term = S.term AND T.anonymized_value IS NULL
WHEN MATCHED THEN UPDATE SET anonymized_value = CONCAT(
  S.prefix,
  LPAD(CAST(S.rn + IF(S.prefix = 'account', base_account, base_brand) AS STRING), 3, '0')
);

SET term_count = (SELECT COUNT(*) FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms`);
IF term_count = 0 THEN
  RAISE USING MESSAGE = 'No sensitive terms found; refusing to publish un-anonymized data. Check account_table/account_column.';
END IF;

SET dict = (
  SELECT CONCAT('{', STRING_AGG(FORMAT('%s:%s', TO_JSON_STRING(term), TO_JSON_STRING(anonymized_value)), ','), '}')
  FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms`
);
SET dict_lit = FORMAT('%T', dict);

-- ── 2. Column plan ───────────────────────────────────────────────────────────
-- One row per column of every base table, with the SQL needed to rewrite it.
EXECUTE IMMEDIATE FORMAT("""
  CREATE TEMP TABLE col_plan AS
  WITH cols AS (
    SELECT
      c.table_name, c.column_name, c.data_type, c.ordinal_position, c.is_partitioning_column,
      CASE
        WHEN cfg.treatment IS NOT NULL THEN UPPER(cfg.treatment)
        WHEN UPPER(c.column_name) IN ('PROFILE_ID', 'ACCOUNT_ID', 'CUSTOMER_ID', 'MERCHANT_ID') THEN 'ID'
        WHEN c.data_type = 'STRING' THEN 'TERMS'
        WHEN c.data_type = 'ARRAY<STRING>' THEN 'TERMS_ARRAY'
        WHEN REGEXP_CONTAINS(c.data_type, r'^(STRUCT|JSON|ARRAY<STRUCT|ARRAY<JSON|RANGE)') THEN 'UNSUPPORTED'
        ELSE 'KEEP'
      END AS treatment,
      CASE
        WHEN UPPER(c.column_name) IN ('PROFILE_ID', 'ACCOUNT_ID', 'CUSTOMER_ID') THEN 'ACCOUNT_ID'
        ELSE UPPER(c.column_name)
      END AS id_entity
    FROM `%s.%s.INFORMATION_SCHEMA.COLUMNS` c
    JOIN `%s.%s.INFORMATION_SCHEMA.TABLES` t
      ON t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    LEFT JOIN `paid-media-2a86.anonymization_keys._anon_column_config` cfg
      ON cfg.table_name = c.table_name AND UPPER(cfg.column_name) = UPPER(c.column_name)
    WHERE NOT EXISTS (
      SELECT 1 FROM `paid-media-2a86.anonymization_keys._anon_column_config` x
      WHERE x.table_name = c.table_name AND x.column_name = '*' AND UPPER(x.treatment) = 'EXCLUDE'
    )
  )
  SELECT
    *,
    CASE treatment
      WHEN 'ID' THEN IF(
        data_type = 'INT64',
        FORMAT('SAFE_CAST(m_%%d.anonymized_value AS INT64) AS `%%s`', ordinal_position, column_name),
        FORMAT('m_%%d.anonymized_value AS `%%s`', ordinal_position, column_name))
      WHEN 'TERMS' THEN FORMAT(
        '`paid-media-2a86.anonymization_keys.anon_text`(src.`%%s`, __DICT__) AS `%%s`', column_name, column_name)
      WHEN 'TERMS_ARRAY' THEN FORMAT(
        'ARRAY(SELECT `paid-media-2a86.anonymization_keys.anon_text`(x, __DICT__) FROM UNNEST(src.`%%s`) AS x WITH OFFSET o ORDER BY o) AS `%%s`',
        column_name, column_name)
    END AS expr_sql,
    IF(treatment = 'ID',
      FORMAT('LEFT JOIN `paid-media-2a86.anonymization_keys._anon_mapping` m_%%d ON m_%%d.entity_type = %%T AND m_%%d.original_value = CAST(src.`%%s` AS STRING)',
             ordinal_position, ordinal_position, id_entity, ordinal_position, column_name),
      NULL) AS join_sql
  FROM cols
""", src_project, src_dataset, src_project, src_dataset);

-- Refuse to publish columns we can't safely rewrite (structs, JSON, ...).
IF EXISTS (SELECT 1 FROM col_plan WHERE treatment = 'UNSUPPORTED') THEN
  RAISE USING MESSAGE = (
    SELECT CONCAT('Unsupported column types, add KEEP/EXCLUDE overrides to _anon_column_config: ',
                  STRING_AGG(CONCAT(table_name, '.', column_name, ' (', data_type, ')'), ', '))
    FROM col_plan WHERE treatment = 'UNSUPPORTED'
  );
END IF;
IF EXISTS (SELECT 1 FROM col_plan WHERE treatment = 'ID' AND data_type NOT IN ('INT64', 'STRING')) THEN
  RAISE USING MESSAGE = 'ID columns must be INT64 or STRING.';
END IF;

-- ── 3. Decide what to do per table ───────────────────────────────────────────
-- SKIP : source unchanged since the last successful run.
-- INCR : date-partitioned table; only partitions modified since the last run are
--        deleted from the target and reloaded.
-- FULL : first run, plan/term changes, or a table we can't do incrementally.
-- src_modified is captured now (before any data is read), so rows that land
-- while this script runs are picked up by the next run.
EXECUTE IMMEDIATE FORMAT("""
  CREATE TEMP TABLE tbl_plan AS
  WITH tbls AS (
    SELECT
      table_name,
      ANY_VALUE(IF(is_partitioning_column = 'YES' AND data_type = 'DATE', column_name, NULL)) AS part_col,
      TO_HEX(MD5(STRING_AGG(
        CONCAT(column_name, ':', data_type, ':', treatment, ':', IFNULL(expr_sql, ''), IFNULL(join_sql, '')),
        '|' ORDER BY ordinal_position))) AS plan_sig
    FROM col_plan
    GROUP BY table_name
  ),
  src_meta AS (
    SELECT table_id AS table_name, TIMESTAMP_MILLIS(last_modified_time) AS src_modified
    FROM `%s.%s.__TABLES__`
  ),
  dst_meta AS (
    SELECT table_name FROM `%s.%s.INFORMATION_SCHEMA.TABLES`
  ),
  joined AS (
    SELECT
      t.table_name, t.part_col, m.src_modified,
      TO_HEX(MD5(CONCAT(%T, '|', t.plan_sig))) AS cfg_hash,
      s.table_name AS state_table, s.source_modified AS prev_modified, s.config_hash AS prev_hash,
      d.table_name AS dst_table
    FROM tbls t
    JOIN src_meta m ON m.table_name = t.table_name
    LEFT JOIN `paid-media-2a86.anonymization_keys._anon_run_state` s ON s.table_name = t.table_name
    LEFT JOIN dst_meta d ON d.table_name = t.table_name
  )
  SELECT
    *,
    CASE
      WHEN state_table IS NULL OR dst_table IS NULL OR prev_hash != cfg_hash THEN 'FULL'
      WHEN src_modified <= prev_modified THEN 'SKIP'
      WHEN part_col IS NULL THEN 'FULL'
      ELSE 'INCR'
    END AS action
  FROM joined
""", src_project, src_dataset, src_project, dst_dataset, dict);

-- For INCR tables: which partitions changed (or disappeared) since the last run?
-- Anything odd (non-date partitions, > 100 changed days) falls back to FULL.
EXECUTE IMMEDIATE FORMAT("""
  CREATE TEMP TABLE work AS
  WITH src_parts AS (
    SELECT table_name, partition_id, last_modified_time
    FROM `%s.%s.INFORMATION_SCHEMA.PARTITIONS`
  ),
  dst_parts AS (
    SELECT table_name, partition_id FROM `%s.%s.INFORMATION_SCHEMA.PARTITIONS`
  ),
  changed AS (
    SELECT t.table_name, p.partition_id
    FROM tbl_plan t JOIN src_parts p ON p.table_name = t.table_name
    WHERE t.action = 'INCR' AND p.last_modified_time > t.prev_modified
    UNION DISTINCT
    SELECT t.table_name, d.partition_id
    FROM tbl_plan t JOIN dst_parts d ON d.table_name = t.table_name
    WHERE t.action = 'INCR'
      AND NOT EXISTS (SELECT 1 FROM src_parts p WHERE p.table_name = d.table_name AND p.partition_id = d.partition_id)
  ),
  summary AS (
    SELECT
      table_name,
      COUNT(*) AS n,
      COUNTIF(NOT REGEXP_CONTAINS(partition_id, r'^\\d{8}$')) AS n_bad,
      STRING_AGG(
        IF(REGEXP_CONTAINS(partition_id, r'^\\d{8}$'),
           CONCAT("DATE '", FORMAT_DATE('%%F', PARSE_DATE('%%Y%%m%%d', partition_id)), "'"), NULL),
        ', ') AS date_list
    FROM changed
    GROUP BY table_name
  )
  SELECT
    t.table_name, t.part_col, t.src_modified, t.cfg_hash,
    CASE
      WHEN t.action != 'INCR' THEN t.action
      WHEN s.n IS NULL THEN 'SKIP'
      WHEN s.n_bad > 0 OR s.n > 100 THEN 'FULL'
      ELSE 'INCR'
    END AS action,
    s.date_list
  FROM tbl_plan t
  LEFT JOIN summary s ON s.table_name = t.table_name
""", src_project, src_dataset, src_project, dst_dataset);

-- ── 4. Account-level ID mapping ──────────────────────────────────────────────
-- Collect distinct ID values from the data we're about to (re)load, then give
-- each unmapped value a random number of the same length (unique per entity).
SET id_sql = (
  SELECT STRING_AGG(
    FORMAT('SELECT %T AS entity_type, CAST(`%s` AS STRING) AS original_value FROM `%s.%s.%s` WHERE `%s` IS NOT NULL%s',
           c.id_entity, c.column_name, src_project, src_dataset, c.table_name, c.column_name,
           IF(w.action = 'INCR', FORMAT(' AND `%s` IN (%s)', w.part_col, w.date_list), '')),
    ' UNION ALL ')
  FROM col_plan c
  JOIN work w ON w.table_name = c.table_name
  WHERE c.treatment = 'ID' AND w.action != 'SKIP'
);

IF id_sql IS NOT NULL THEN
  EXECUTE IMMEDIATE FORMAT('CREATE TEMP TABLE id_values AS SELECT DISTINCT entity_type, original_value FROM (%s)', id_sql);

  LOOP
    SET attempt = attempt + 1;
    IF attempt > 20 THEN
      RAISE USING MESSAGE = 'Could not allocate unique anonymized IDs after 20 attempts.';
    END IF;

    CREATE OR REPLACE TEMP TABLE pending AS
    SELECT v.entity_type, v.original_value
    FROM id_values v
    LEFT JOIN `paid-media-2a86.anonymization_keys._anon_mapping` m
      ON m.entity_type = v.entity_type AND m.original_value = v.original_value
    WHERE m.original_value IS NULL;

    SET pending_count = (SELECT COUNT(*) FROM pending);
    IF pending_count = 0 THEN
      LEAVE;
    END IF;

    INSERT INTO `paid-media-2a86.anonymization_keys._anon_mapping`
      (entity_type, original_value, anonymized_value, first_seen_at)
    SELECT entity_type, original_value, cand, CURRENT_TIMESTAMP()
    FROM (
      SELECT
        entity_type, original_value,
        CONCAT(
          CAST(1 + CAST(FLOOR(RAND() * 9) AS INT64) AS STRING),
          LPAD(CAST(CAST(FLOOR(RAND() * POW(10, GREATEST(LENGTH(original_value) - 1, 0))) AS INT64) AS STRING),
               GREATEST(LENGTH(original_value) - 1, 0), '0')
        ) AS cand
      FROM pending
    ) c
    WHERE c.cand != c.original_value
      AND NOT EXISTS (
        SELECT 1 FROM `paid-media-2a86.anonymization_keys._anon_mapping` m
        WHERE m.entity_type = c.entity_type AND m.anonymized_value = c.cand)
    QUALIFY ROW_NUMBER() OVER (PARTITION BY entity_type, cand ORDER BY original_value) = 1;
  END LOOP;
END IF;

-- ── 5. Load tables ───────────────────────────────────────────────────────────
FOR t IN (SELECT * FROM work WHERE action != 'SKIP' ORDER BY table_name) DO
  SET repl = IFNULL((
    SELECT CONCAT('REPLACE (', REPLACE(STRING_AGG(expr_sql, ', ' ORDER BY ordinal_position), '__DICT__', dict_lit), ')')
    FROM col_plan WHERE table_name = t.table_name AND expr_sql IS NOT NULL
  ), '');
  SET joins = IFNULL((
    SELECT STRING_AGG(join_sql, ' ' ORDER BY ordinal_position)
    FROM col_plan WHERE table_name = t.table_name AND join_sql IS NOT NULL
  ), '');

  IF t.action = 'FULL' THEN
    -- CREATE OR REPLACE can't change a table's partitioning, so drop the target
    -- first, but only when its partitioning differs (keeps normal rebuilds atomic).
    EXECUTE IMMEDIATE FORMAT(
      'SELECT MAX(IF(is_partitioning_column = "YES", column_name, NULL)) FROM `%s.%s.INFORMATION_SCHEMA.COLUMNS` WHERE table_name = %T',
      src_project, dst_dataset, t.table_name)
    INTO dst_part;
    IF IFNULL(dst_part, '') != IFNULL(t.part_col, '') THEN
      EXECUTE IMMEDIATE FORMAT('DROP TABLE IF EXISTS `%s.%s.%s`', src_project, dst_dataset, t.table_name);
    END IF;

    EXECUTE IMMEDIATE FORMAT("""
      CREATE OR REPLACE TABLE `%s.%s.%s` %s AS
      SELECT src.* %s
      FROM `%s.%s.%s` src
      %s
    """,
      src_project, dst_dataset, t.table_name,
      IF(t.part_col IS NULL, '', FORMAT('PARTITION BY `%s`', t.part_col)),
      repl,
      src_project, src_dataset, t.table_name,
      joins);
  ELSE
    -- INCR: swap only the changed dates, atomically.
    BEGIN TRANSACTION;
    EXECUTE IMMEDIATE FORMAT('DELETE FROM `%s.%s.%s` WHERE `%s` IN (%s)',
      src_project, dst_dataset, t.table_name, t.part_col, t.date_list);
    EXECUTE IMMEDIATE FORMAT("""
      INSERT INTO `%s.%s.%s`
      SELECT src.* %s
      FROM `%s.%s.%s` src
      %s
      WHERE src.`%s` IN (%s)
    """,
      src_project, dst_dataset, t.table_name,
      repl,
      src_project, src_dataset, t.table_name,
      joins,
      t.part_col, t.date_list);
    COMMIT TRANSACTION;
  END IF;

  -- Sanity check: row counts must be identical.
  EXECUTE IMMEDIATE FORMAT(
    'SELECT (SELECT COUNT(*) FROM `%s.%s.%s`), (SELECT COUNT(*) FROM `%s.%s.%s`)',
    src_project, src_dataset, t.table_name, src_project, dst_dataset, t.table_name)
  INTO n_src, n_dst;
  IF n_src != n_dst THEN
    RAISE USING MESSAGE = FORMAT('Row count mismatch in %s: source=%d anonymized=%d', t.table_name, n_src, n_dst);
  END IF;

  -- Remember what we loaded, so the next run can skip it.
  MERGE `paid-media-2a86.anonymization_keys._anon_run_state` S
  USING (SELECT t.table_name AS table_name, t.src_modified AS source_modified, t.cfg_hash AS config_hash) N
  ON S.table_name = N.table_name
  WHEN MATCHED THEN UPDATE SET source_modified = N.source_modified, config_hash = N.config_hash, rebuilt_at = CURRENT_TIMESTAMP()
  WHEN NOT MATCHED THEN INSERT (table_name, source_modified, config_hash, rebuilt_at)
    VALUES (N.table_name, N.source_modified, N.config_hash, CURRENT_TIMESTAMP());
END FOR;

SELECT
  COUNTIF(action = 'FULL') AS tables_full,
  COUNTIF(action = 'INCR') AS tables_incremental,
  COUNTIF(action = 'SKIP') AS tables_skipped,
  (SELECT COUNT(*) FROM `paid-media-2a86.anonymization_keys._anon_sensitive_terms`) AS sensitive_terms,
  (SELECT COUNT(*) FROM `paid-media-2a86.anonymization_keys._anon_mapping`) AS mapped_ids
FROM work;
