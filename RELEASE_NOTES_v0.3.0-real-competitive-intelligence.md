# Release Notes - v0.3.0-real-competitive-intelligence

Date: 2026-03-24

## Summary

v0.3.0 upgrades competitor research from model-only generation to web-grounded competitive intelligence.

## What changed

- Added web search grounding layer:
  - `server/services/webSearchService.js`
  - Tavily-powered search with parallel queries and dedupe
- Added smart query planner:
  - `server/services/searchQueryBuilder.js`
  - idea-aware query generation and keyword extraction fallback
- Reworked market research agent flow:
  - search phase -> extraction/analysis phase -> structured output
  - graceful fallback to `ai_generated` when web search is unavailable
- Updated competitor schema with evidence fields:
  - `source: "web_search" | "ai_generated"`
  - `website`
  - `search_snippet`
- Updated Notion upsert mapping for competitors:
  - writes `Source`, `Website`, and `Evidence` where available
  - preserves idempotency key behavior

## New environment variables

- `TAVILY_API_KEY`
- `WEB_SEARCH_ENABLED` (default `false`)
- `WEB_SEARCH_MAX_RESULTS` (default `5`, max `10`)

## Compatibility

- Existing scripts preserved:
  - `start`, `dev`, `inspect:schemas`, `workflow:once`, `smoke`, `mcp`, `demo:mcp`, `demo:challenge`
- Existing MCP tools preserved.

## Versioning

- Bump: `0.2.3` -> `0.3.0`
- Recommended tag: `v0.3.0-real-competitive-intelligence`
