# Release Notes - v0.2.3-prompt-enum-guard

Date: 2026-03-24

## Summary

v0.2.3 adds stricter prompt guidance for roadmap and marketing outputs to preserve enum values while still adapting human-readable content to the input language.

## Highlights

- Updated `prompts/productPlanner.md` language rule:
  - `feature` remains language-adaptive
  - enum fields are locked:
    - `priority`: `High|Medium|Low`
    - `complexity`: `High|Medium|Low`
    - `status`: `Planned`
- Updated `prompts/marketingAgent.md` language rule:
  - `channel`, `strategy`, `contentIdea` remain language-adaptive
  - enum field is locked:
    - `priority`: `High|Medium|Low`

## Why this matters

- Keeps user-facing text in the same language as input ideas.
- Prevents schema failures caused by translated enum literals.
- Improves deterministic compliance in strict JSON validation.

## Compatibility

- Existing scripts unchanged:
  - `start`, `dev`, `inspect:schemas`, `workflow:once`, `smoke`, `mcp`, `demo:mcp`, `demo:challenge`
- Existing MCP tools remain unchanged.

## Versioning

- Bump: `0.2.2` -> `0.2.3`
- Tag: `v0.2.3-prompt-enum-guard`
