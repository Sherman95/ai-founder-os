# Release Notes - v0.2.2-language-adaptive

Date: 2026-03-24

## Summary

v0.2.2 introduces language-adaptive output generation so AI Founder OS automatically responds in the same language as the input startup idea text.

## Highlights

- Added language detection service for robust input-language inference:
  - script-based detection (Arabic, Cyrillic, CJK, etc.)
  - heuristic word-based fallback for Latin-script languages
- Propagated `languageHint` through workflow execution to all generation agents.
- Added explicit language rule enforcement in prompts:
  - Idea Analyzer
  - Market Research
  - Product Planner
  - Marketing Agent
- Extended corrections loop to preserve the same input language when applying human corrections.

## Gemini model reliability

- Updated default JSON generation model from `gemini-2.0-flash` to `gemini-2.5-flash`.
- Added `GEMINI_MODEL` configuration to allow runtime model override.

## Compatibility

- Existing scripts remain intact:
  - `start`, `dev`, `inspect:schemas`, `workflow:once`, `smoke`, `mcp`, `demo:mcp`, `demo:challenge`
- Existing MCP tools remain backward compatible.

## Versioning

- Bump: `0.2.1` -> `0.2.2`
- Tag: `v0.2.2-language-adaptive`
