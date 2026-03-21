# Release Notes - v0.2.0-mcp-challenge

Date: 2026-03-21

## Summary

v0.2.0 upgrades AI Founder OS from a Notion-first API backend into an MCP-capable release for challenge delivery.

## Highlights

- Added Notion provider abstraction with `NOTION_MODE=api|mcp`.
- Added Notion MCP client/service path with API adapter fallback.
- Added Founder OS MCP server with tools:
  - `founder.health`
  - `founder.inspect_schemas`
  - `founder.list_ideas_to_run`
  - `founder.claim_idea`
  - `founder.run_idea`
- Added package scripts:
  - `npm run mcp`
  - `npm run demo:mcp`
- Added MCP docs:
  - `docs/VS_CODE_MCP_SETUP.md`
  - `docs/MCP_SDK_NOTES.md`
  - `SUBMISSION_DEVTO.md`

## Reliability and quality

- Startup schema validation remains fail-fast.
- Claim/lock and idempotent upsert behavior preserved.
- Gemini JSON parse/repair loop hardened.
- Fallback paths expanded across generation agents to tolerate quota limits.
- Output list enforcement preserved via environment limits.

## Compatibility

- Existing scripts preserved:
  - `start`
  - `dev`
  - `inspect:schemas`
  - `workflow:once`
  - `smoke`

## Known constraints

- MCP server transport is a minimal JSON-RPC HTTP implementation for deterministic challenge delivery.
- Official SDK transport migration is documented in `docs/MCP_SDK_NOTES.md`.

## Upgrade notes

1. Copy `.env.example` updates into `.env`.
2. Set `NOTION_MODE` for target operation.
3. Validate with `npm run smoke`.
4. Optional: start MCP server with `npm run mcp` and run backup demo with `npm run demo:mcp`.
