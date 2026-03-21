# Release Notes - v0.1.0-mvp-demo

Date: 2026-03-21

## Summary

This release finalizes the AI Founder OS MVP backend for demo publication.
The system is now validated end-to-end with Notion-driven execution and resilient behavior under Gemini quota/rate-limit conditions.

## Delivered

- Express backend with health endpoint and structured logging
- Poller-based trigger processing (`Run` / `Queued`) without webhooks
- Sequential orchestration pipeline:
  - ideaAnalyzer
  - marketResearch
  - productPlanner
  - marketingAgent
- Notion integration with schema-adaptive mapping:
  - Supports database/data source API differences
  - Supports workflow status as `status`, `select`, or `multi_select`
  - Tolerates optional startup fields missing in DB
- Idempotent output writes:
  - Primary by `Key`
  - Fallback by `Source Idea + title` when `Key` is absent
- Gemini JSON generation with retries + Zod validation
- Analyzer fallback path when Gemini is unavailable or returns 429 quota errors

## New Operational Scripts

- `npm run inspect:schemas`
  - Inspects property names/types across configured Notion DBs
- `npm run workflow:once -- <ideaPageId>`
  - Executes one full workflow run for a specific idea page

## Validation Evidence

- Health endpoint verified: `GET /health -> status=ok`
- E2E workflow run verified on real idea page:
  - Status transitions to `Done`
  - Outputs written:
    - Competitors: 2
    - Roadmap: 3
    - Marketing: 3
- Re-run confirmed basic idempotency (no duplicate count growth)
- Gemini 429 observed and successfully handled via fallback analyzer

## Known Constraints

- Demo reliability still depends on external provider quota and network availability.
- Fallback analysis ensures continuity but not full LLM-quality output when quota is exhausted.

## Publication Readiness

Status: Ready for publication after commit/push/tag sequence.

Recommended tag: `v0.1.0-mvp-demo`
