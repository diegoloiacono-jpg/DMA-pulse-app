# BigQuery anonymizer

Copies every table in `paid-media-2a86.google_ads` into `paid-media-2a86.anonymized_data`, replacing only what identifies the client. Metrics, dates, markets, channel codes, campaign types and audience wording stay as they are, so the app's naming-convention, market and audience logic still works on the anonymized data. Developers using personal code assistants should point at `anonymized_data`, never at `google_ads`.

```
ACME_FR-FR_AWA_PB_CSN_AO_GOO_Demand-Gen_BAW_Custom_aud_Mix_Visitors-[FR]
→ brand001_FR-FR_AWA_PB_CSN_AO_GOO_Demand-Gen_BAW_Custom_aud_Mix_Visitors-[FR]
```

## What gets replaced
- **Sensitive terms** (account names, their word tokens, and brand terms you add) inside *any* STRING column, case-insensitive, on word boundaries. Tokens look like `account001` / `brand001` and never change once assigned.
- **Account-level IDs**: `PROFILE_ID`, `ACCOUNT_ID`, `CUSTOMER_ID`, `MERCHANT_ID` become random numbers of the same length, identical in every table so joins keep working.
- Everything else is copied unchanged (campaign/ad group/ad IDs included; override via `_anon_column_config`).

## Files
| File | Purpose |
|---|---|
| `setup.sql` | Creates the datasets, key tables, the `anon_text` JS function and the `v_anon_lookup` view. |
| `anonymize.sql` | The scheduled script. |
| `deploy.sh` | Runs setup, creates the `dma-pulse-anonymizer` service account with dataset-level grants, creates the daily schedule. |
| `discover_terms.sql` | Lists frequent tokens in campaign/account names to help you pick brand terms. Shows real data, run it yourself. |
| `verify.sql` | Row-count and leak checks. |

## First-time setup
1. `./anonymizer/deploy.sh` (needs a working `bq`). Without `bq`, use `run.py` instead (PowerShell, repo root):
   ```powershell
   gcloud auth application-default login
   gcloud iam service-accounts create dma-pulse-anonymizer --project paid-media-2a86
   gcloud projects add-iam-policy-binding paid-media-2a86 --member "serviceAccount:dma-pulse-anonymizer@paid-media-2a86.iam.gserviceaccount.com" --role roles/bigquery.jobUser
   $r = "--with", "google-cloud-bigquery", "--with", "google-cloud-bigquery-datatransfer", "anonymizer/run.py"
   uv run @r setup; uv run @r grants; uv run @r schedule
   ```
   `uv run @r run` runs the job once; `uv run @r verify` runs the checks.
2. Find brand terms: run `discover_terms.sql` yourself and note the client-identifying tokens.
3. Add them:
   ```sql
   INSERT INTO `paid-media-2a86.anonymization_keys._anon_sensitive_terms` (term, entity_type, source, first_seen_at)
   VALUES ('ACME', 'BRAND', 'manual', CURRENT_TIMESTAMP());
   ```
   Leave `anonymized_value` empty; the next run assigns it.
4. Run the scheduled query once from the console (*Scheduled queries → DMA Pulse anonymizer → Run now*), then `verify.sql`. Both result sets should be empty.

## What a run does
Per table, based on `_anon_run_state`:
- **SKIP**: the source table hasn't changed since the last successful run.
- **INCR**: date-partitioned table. Only partitions modified since the last run (or removed from the source) are deleted from the target and reloaded, in one transaction. More than 100 changed days falls back to FULL.
- **FULL**: first run, a table without a `DATE` partition column that changed, or any change to the sensitive terms or column plan (a new term has to be applied to old rows too).

The last statement of a run reports `tables_full / tables_incremental / tables_skipped`. Changing `anonymize.sql` means re-publishing it to the schedule: `run.py schedule` updates the existing one.

## Day to day
- **New data** arrives in `google_ads`: the next run reuses existing tokens and only creates tokens for unseen terms and IDs.
- **A brand slipped through**: insert the term as above, re-run. Existing tokens are unchanged.
- **Too much was anonymized** (a generic word in an account name): add it to `_anon_term_stoplist` and delete the row from `_anon_sensitive_terms`.
- **Look up what an anonymized value was**: `SELECT * FROM anonymization_keys.v_anon_lookup WHERE anonymized_value = 'brand001'`.
- **Per-column overrides** (`KEEP`, `TERMS`, `ID`) and whole-table `EXCLUDE` (use `column_name = '*'`) go in `_anon_column_config`.

## Access
`anonymization_keys` holds the key to reverse the anonymization. Restrict it to people who may see the real data. Developers get access to `anonymized_data` only.

## Limits
- Only listed terms are caught. Typos, abbreviations or product names that imply the client stay visible until added.
- Product titles, locations and ad copy stay real apart from listed terms, so they can still hint at the client.
- Table-level grants on `anonymized_data` tables are lost whenever a table is fully rebuilt, so grant at dataset level. Date partitioning is copied; clustering is not.
- Struct/JSON columns make the job fail on purpose; add a `KEEP` or `EXCLUDE` override once you've checked them.
- Tables deleted from `google_ads` are not removed from `anonymized_data`.
