# AI Founder OS - MVP Day 1 Bootstrap

AI Founder OS is a demo-focused backend that uses Notion as UI + database + memory.
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
4. Workflow marks idea as `Running`.
5. Agents produce:
   - Competitors
   - Roadmap
   - Marketing items
6. Notion output DBs are upserted with idempotency key:
   - `Key = ${ideaPageId}:${type}:${name}`
7. Idea is updated to `Done` with:
   - `Startup Viability Score`
   - `Executive Summary`
   - `Run Log`

On failure, idea status becomes `Failed` and `Run Log` stores the error.

## Required Notion properties (MVP)

### Startup Ideas DB

- `Status` (status)
- `Startup Viability Score` (number)
- `Executive Summary` (rich text)
- `Run Log` (rich text)
- A title property for idea name
- Optional description rich text property

### Output DBs (Competitors, Roadmap, Marketing)

Each output DB should have at minimum:

- Title property
- `Key` (rich text)
- `Source Idea` (rich text)

Recommended fields:

- Competitors: `Pricing`, `Strengths`, `Weaknesses`, `Notes`
- Roadmap: `Priority`, `Complexity`, `Status`
- Marketing: `Channel`, `Strategy`, `Content Idea`, `Priority`

## Reliability notes

- Poller processes one idea at a time (MVP rate-limit safe).
- Poller skips if a workflow is already running.
- Workflow skips ideas already marked `Running`.
- Upserts avoid duplicates using `Key` lookups.
- Gemini JSON output is validated by Zod with retry logic (2 retries max).

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
