# Release Notes - v0.2.1-human-in-loop

Date: 2026-03-21

## Summary

v0.2.1 adds a human-in-the-loop correction loop for generated output rows in Notion, exposed through MCP-native tools for a judge-friendly challenge demo.

## Highlights

- Added review-aware output handling for optional properties:
  - `Needs Review` (checkbox)
  - `Correction Notes` (rich text)
  - alias tolerance in multiple naming styles/languages
- Added new Founder MCP tools:
  - `founder.list_reviews`
  - `founder.apply_corrections`
- Added review service:
  - query flagged output rows
  - regenerate only flagged rows by type
  - update row by page_id
  - unflag + clear notes after apply
  - checksum dedupe + in-process lock
- Added correction prompts:
  - `prompts/competitorCorrection.md`
  - `prompts/roadmapCorrection.md`
  - `prompts/marketingCorrection.md`
- Added challenge demo script:
  - `npm run demo:challenge -- <ideaPageId>`

## Reliability behavior

- If review columns do not exist, review tools return zero items and do not crash.
- `founder.apply_corrections` continues processing even if individual rows fail.
- Gemini quota/rate-limit errors use safe deterministic fallback correction for that row.

## Compatibility

- Existing scripts preserved unchanged:
  - `start`, `dev`, `inspect:schemas`, `workflow:once`, `smoke`, `mcp`, `demo:mcp`

## Versioning

- Bump: `0.2.0` -> `0.2.1`
- Recommended tag name: `v0.2.1-human-in-loop`
