# Google Ads → BigQuery: remaining gaps after the 2026-08-20 rebuild

The new tables landed and they close nearly everything we'd flagged. Verified against
`paid-media-2a86.google_ads` on 2026-08-25. RSA creative text, target ROAS, impression share,
listing group filters, dayparting, geo targeting mode, budgets, ad group types, Shopping
conversions and paused/removed entities are all present and populated. Thank you.

We've repointed the audit at the new tables and it now runs all seven categories on real data.
Five things are still missing. Only the first is a probable bug — the rest are genuine additions.

## 1. `GOOGLEADS_ADMETADATA` contains only Demand Gen / Video ads — no RSAs

This looks like a filter left on the report. `AD_STRENGTH` is populated, but only for ad types
we don't need it for:

    ad type                        ads with stats   with metadata   with ad_strength
    Responsive search ad                    2,405               0                  0
    Expanded dynamic search ad                153               0                  0
    Demand Gen video responsive                69              69                 69
    Multi asset demand gen ad                  47              47                 47

116 of 2,692 ads join. For contrast, every other metadata table joins cleanly:
keywords 8,283/8,283, ad groups 2,527/2,527, asset groups 107/107.

**Ask:** include responsive search ads (and the other search/shopping/display types) in whatever
report feeds `GOOGLEADS_ADMETADATA`. This is the only remaining blocker on search creative scoring.

Minor, same table: it carries up to 4 rows per `AD_ID` because it's segmented by
`AD_FORMAT_TYPE`. Not a problem for us — we dedupe — but flagging in case it's unintended.

## 2. PMax asset text

`GOOGLEADS_ASSETGROUPASSET` gives us 11,573 assets with their field types, which is enough to
score asset *variety*. But the text itself isn't reachable: `GOOGLEADS_ASSETMETADATA` has only
389 rows, all sitelinks/callouts/promotions, and shares **zero** asset IDs with
`ASSETGROUPASSET`. `ASSET_TEXT_TEXT` is empty on all 389.

**Ask:** populate `ASSET_TEXT_TEXT` for the assets referenced by `ASSETGROUPASSET` — specifically
the Headline, Long headline and Description field types.

## 3. Conversion action configuration

No conversion-action table exists in the new schema. Missing fields:

- `PRIMARY_FOR_GOAL` — primary vs. secondary conversion goals
- attribution model (data-driven vs. last-click)
- counting type (one vs. every)
- conversion action name / category

This is the weakest remaining audit category — we can see conversion volume and value everywhere,
but nothing about how conversions are configured. Three audit topics are stubbed on this.

## 4. Negative keywords and shared sets

No negative keyword signal anywhere in the new tables — no `IS_NEGATIVE`, no campaign-level
negative criteria, no shared negative list table. (The old frozen `GOOGLEADS_KEYWORD` had an
`IS_NEGATIVE` column, but it was `false` on all 49,987 rows.)

**Ask:** a negative keyword report at ad group + campaign level, and shared negative lists if
available.

## 5. Keyword serving status

`BELOW_FIRST_PAGE_BID`, `LOW_SEARCH_VOLUME`, `RARELY_SERVED` — none exported. We can see keyword
status (enabled/paused/removed) but not whether enabled keywords are actually eligible to serve.

## Smaller items

- **`TARGET_CPA` is present but empty on all 6,323 rows** in `GOOGLEADS_P_BIDDINGSTRATEGY`.
  `TARGET_ROAS` works fine. If no campaigns use Target CPA that's expected — just confirming.
- **Dayparting is day-of-week only.** `DAY_OF_WEEK_WITH_NUM` is there; hour-of-day isn't. Fine
  for now, but hour-level would make the scheduling check materially better.
- **Metadata tables have no `PROFILE_ID`.** 10 of 12 lack an account key. `CAMPAIGN_ID` is
  globally unique so our joins work, but we can't filter metadata by account without joining
  through a stats table. Adding `PROFILE_ID` would simplify things.
- **Two missing days:** 2026-08-21 and 2026-08-22 are absent from every dated table.
- **Feed attributes regressed.** The new `GOOGLEADS_P_SHOPPINGBASICSTATS` has `PRODUCT_TITLE`
  only. The old frozen `GOOGLEADS_SHOPPING` had `PRODUCT_TYPE_LEVEL_1..5`, `CUSTOM_ATTRIBUTE`,
  `OFFER_ID`, `MERCHANT_ID` and `PRODUCT_CONDITION`. We're currently reading feed segmentation
  from the frozen table and flagging it as a stale snapshot. Could product type levels and
  custom labels be added to the new Shopping table?
- **`GOOGLEADS_AI_MAX` has no replacement** in the new schema and is frozen at 08-17. We're
  deriving AI Max delivery from `SEARCH_TERM_MATCH_SOURCE = 'AI Max broad match'` instead, which
  works — just flagging that the dedicated table is now stale.

## Priority

If you're picking: **(1) the ADMETADATA RSA filter** unblocks the most and looks like a quick
fix, then **(3) conversion action config**, then **(4) negatives**. Items 2 and 5 are nice-to-have.

Also confirming the old flat `GOOGLEADS_*` tables (frozen 2026-08-17) are intentionally
deprecated — we've stopped reading them apart from `GOOGLEADS_SHOPPING` for the feed attributes
noted above. Let us know if they'll be dropped so we can plan around it.
