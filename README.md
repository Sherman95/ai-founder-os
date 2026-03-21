# AI Founder OS - Production-Ready Basic Backend

AI Founder OS is a production-ready basic backend that uses Notion as UI + database + memory.
The system polls a Notion database for startup ideas with Status `Run` or `Queued`, executes a multi-agent workflow, and writes outputs into Notion databases:

- Competitor Research
- Product Roadmap
- Marketing Strategy

It also writes a startup viability score and executive summary back to the idea.

## Stack

- Node.js 18+
- Express
- Notion API (`@notionhq/client`)
- Gemini API (`@google/genai`)
- Zod for schema validation
- Pino for logs

## Project structure

```txt
server/
  index.js
  config/
    env.js
  routes/
    health.js
  orchestrator/
    workflowEngine.js
    poller.js
  services/
    notionService.js
    geminiService.js
  agents/
    ideaAnalyzer.js
    marketResearch.js
    productPlanner.js
    marketingAgent.js
  schemas/
    ideaAnalysis.schema.js
    competitor.schema.js
    roadmap.schema.js
    marketing.schema.js
  scripts/
    inspectNotionSchemas.js
    runWorkflowOnce.js
prompts/
  ideaAnalyzer.md
  marketResearch.md
  productPlanner.md
  marketingAgent.md
README.md
.env.example
```

## Environment variables

Copy `.env.example` to `.env` and fill values:

- `PORT`
- `NOTION_TOKEN`
- `NOTION_STARTUP_IDEAS_DB_ID`
- `NOTION_COMPETITORS_DB_ID`
- `NOTION_ROADMAP_DB_ID`
- `NOTION_MARKETING_DB_ID`
- `GEMINI_API_KEY`
- `POLL_INTERVAL_MS` (30000 to 120000 recommended)
- `DISABLE_POLLER` (`true` or `false`)
- `MAX_COMPETITORS` (default `5`)
- `MAX_ROADMAP_ITEMS` (default `7`)
- `MAX_MARKETING_ITEMS` (default `7`)

Important:
- Placeholder values in `.env.example` are intentionally invalid for runtime.
- Replace every placeholder with real credentials/IDs before running `npm run dev` or `npm run start`.

If any required variable is missing, startup fails with a clear validation error.

## Install and run

```bash
npm install
npm run dev
```

Production mode:

```bash
npm run start
```

Operational scripts:

```bash
npm run inspect:schemas
npm run workflow:once -- <ideaPageId>
npm run smoke
```

## Health check

`GET /health`

Example response:

```json
{
  "status": "ok",
  "time": "2026-03-21T10:00:00.000Z",
  "version": "0.1.0"
}
```

## Notion MVP flow

1. In Notion Startup Ideas DB, create/update an idea.
2. Set `Status` to `Run` (or `Queued`).
3. Poller checks every `POLL_INTERVAL_MS`.
  - Set `DISABLE_POLLER=true` to pause polling while keeping API alive.
4. Workflow marks idea as `Running`.
5. Agents produce:
   - Competitors
   - Roadmap
   - Marketing items
6. Notion output DBs are upserted with idempotency key:
   - `Key = ${ideaPageId}:${type}:${name}`
  - If `Key` does not exist in a target DB, fallback upsert is done by `Source Idea + title`.
7. Idea is updated to `Done` with:
   - `Startup Viability Score`
   - `Executive Summary`
   - `Run Log`

On failure, idea status becomes `Failed` and `Run Log` stores the error.

## Required Notion properties

### Startup Ideas DB

- Workflow status property named like `Status` or `Estado` with one of these types:
  - `status`
  - `select`
  - `multi_select`
- Optional: `Startup Viability Score` / `Score` (number or rich text)
- Optional: `Executive Summary` / `Summary` (rich text)
- Optional: `Run Log` / `Logs` (rich text)
- A title property for idea name
- Optional description rich text property

### Output DBs (Competitors, Roadmap, Marketing)

Each output DB should have at minimum:

- Title property
- `Source Idea` (rich text)

Optional but recommended:

- `Key` (rich text)

Recommended fields:

- Competitors: `Pricing`, `Strengths`, `Weaknesses`, `Notes`
- Roadmap: `Priority`, `Complexity`, `Status`
- Marketing: `Channel`, `Strategy`, `Content Idea`, `Priority`

## Reliability notes

- Poller processes one idea at a time (MVP rate-limit safe).
- Poller skips if a workflow is already running.
- Workflow skips ideas already marked `Running`.
- Upserts avoid duplicates using `Key`; if `Key` is missing, fallback matching uses `Source Idea + title`.
- Gemini JSON output is validated by Zod with retry logic (2 retries max).
- If Gemini is rate-limited or unavailable, `ideaAnalyzer` uses a deterministic fallback so workflow can still complete.
- Poller workflow claims each idea before processing to prevent duplicate processing across instances.
- Startup runs schema validation against configured Notion DBs and exits fast when requirements are missing.

## Limits

- This release is production-ready basic, not high-scale distributed orchestration.
- Throughput is intentionally conservative (single in-process worker loop).
- Output list sizes are bounded by env limits to control model cost.
- Notion/Gemini API quota and network reliability still affect throughput.

## Demo script

1. Start server with `npm run dev`.
2. Confirm `GET /health` is OK.
3. In Notion, set one Startup Idea status to `Run`.
4. Wait one poll cycle.
5. Verify:
   - idea status `Running` then `Done`
   - score and summary written
   - rows created/upserted in 3 output DBs
6. Re-run same idea and verify no duplicate rows.
