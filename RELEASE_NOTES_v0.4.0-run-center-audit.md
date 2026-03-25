# Release Notes - v0.4.0-run-center-audit

Date: 2026-03-24

## Summary

v0.4.0 upgrades AI Founder OS from output generation to a judge-ready Run Center model in Notion.

This release adds auditable run tracking, evidence-first entities, claim traceability, feature comparison, scorecards, and operational MCP controls for retry/replay.

## What changed

- Added optional Run Center entities (feature-flagged):
  - Runs
  - Evidence
  - Claims
  - Feature Matrix
  - Competitor Scorecards
- Added run lifecycle orchestration:
  - create run record at start
  - stage-aware failure tracking (`analyze`, `research`, `write`, `unknown`)
  - finalize with duration, counts, summary, and artifact payload
- Added evidence persistence pipeline:
  - stores web search results as evidence rows
  - URL-based dedupe per run
  - run and idea linkage support
- Upgraded market research contract:
  - `competitors[]`
  - `claims[]`
  - `feature_matrix[]`
  - `scorecard_inputs[]`
  - `search_queries[]`
  - `web_results[]`
- Added deterministic scorecard computation with risk penalties:
  - weighted score inputs
  - normalized output range 0..100
- Extended competitor writes for judge-friendly fields where schema supports them:
  - run relation
  - evidence relation
  - confidence, category, pricing model, ICP, key differentiators
- Added new MCP tools:
  - `founder.retry_run`
  - `founder.replay_run`
  - `founder.get_run`
- Updated existing MCP run execution tool to support explicit mode and replay source.
- Updated documentation and version metadata to 0.4.0.

## Files introduced

- `server/schemas/marketResearchOutput.schema.js`
- `server/mcp/tools/retryRun.js`
- `server/mcp/tools/replayRun.js`
- `server/mcp/tools/getRun.js`
- `RELEASE_NOTES_v0.4.0-run-center-audit.md`

## Environment additions

- `NOTION_RUNS_DB_ID`
- `NOTION_EVIDENCE_DB_ID`
- `NOTION_CLAIMS_DB_ID`
- `NOTION_FEATURE_MATRIX_DB_ID`
- `NOTION_SCORECARDS_DB_ID`
- `NOTION_UI_WOW_MODE` (default `false`)

## Compatibility and behavior

- Backward compatible by default.
- Existing MVP flow remains active when `NOTION_UI_WOW_MODE=false`.
- New entities are written only when WOW mode is enabled and target DB IDs are configured.
- Existing scripts remain available:
  - `dev`, `start`, `inspect:schemas`, `workflow:once`, `smoke`, `mcp`, `demo:mcp`, `demo:challenge`

## Versioning

- Bump: `0.3.0` -> `0.4.0`
- Recommended tag: `v0.4.0-run-center-audit`
