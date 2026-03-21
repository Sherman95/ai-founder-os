# Release Notes - v0.1.1-final

Date: 2026-03-21

## Summary

This release upgrades AI Founder OS from demo-hardening to a production-ready basic backend while preserving the Notion-first architecture and poller orchestration model.

## Highlights

- Real Gemini-powered agent generation for:
  - `marketResearch`
  - `productPlanner`
  - `marketingAgent`
- Strict JSON behavior with repair retries in Gemini wrapper:
  - Parse/validation failures trigger up to 2 repair attempts
  - Repair prompt includes error context and requests corrected JSON only
- Minimal fallbacks added for non-analyzer agents when Gemini quota/rate-limit errors occur
- Claim/lock flow to reduce duplicate processing across instances:
  - `claimIdeaForRun(pageId)` in Notion service
  - Workflow claims idea before agent work
- Startup schema validation (fail fast):
  - Startup Ideas: title + workflow status property required
  - Output DBs: title + `Source Idea` required
- Poller control:
  - `DISABLE_POLLER=true` support
- Cost controls:
  - `MAX_COMPETITORS`
  - `MAX_ROADMAP_ITEMS`
  - `MAX_MARKETING_ITEMS`
- New operational docs and scripts:
  - `RUNBOOK.md`
  - `npm run smoke`

## Compatibility and Scripts

Existing scripts preserved:
- `start`
- `dev`
- `inspect:schemas`
- `workflow:once`

Added:
- `smoke`

## Operational Notes

- Notion compatibility retained for both `databases` and `dataSources` query paths.
- Workflow remains intentionally conservative (single in-process poller loop).
- Gemini 429 conditions still depend on provider quota; fallback paths keep workflow completion possible.

## Version

- Package version: `0.1.1`
- Recommended tag: `v0.1.1-final`
