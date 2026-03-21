# AI Founder OS - Production-Ready Basic Backend (v0.2.1 Human-in-the-Loop)

AI Founder OS is a production-ready basic backend that uses Notion as UI + database + memory.
The system polls a Notion database for startup ideas with Status `Run` or `Queued`, executes a multi-agent workflow, and writes outputs into Notion databases:

- Competitor Research
- Product Roadmap
- Marketing Strategy

It also writes a startup viability score and executive summary back to the idea.

This release adds MCP support in two directions:

- Provider mode switch for Notion access: `NOTION_MODE=api|mcp`
- Founder OS MCP server exposing high-level tools (`founder.*`)
- Human-in-the-loop corrections loop for output rows flagged in Notion

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
    notionProvider.js
    notionMcpClient.js
    notionMcpService.js
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
  mcp/
    server.js
    tools/
      health.js
      inspectSchemas.js
      listIdeasToRun.js
      claimIdea.js
      runIdea.js
      listReviews.js
      applyCorrections.js
prompts/
  ideaAnalyzer.md
  marketResearch.md
  productPlanner.md
  marketingAgent.md
  competitorCorrection.md
  roadmapCorrection.md
  marketingCorrection.md
README.md
.env.example
docs/
  VS_CODE_MCP_SETUP.md
  MCP_SDK_NOTES.md
SUBMISSION_DEVTO.md
```

## Environment variables

Copy `.env.example` to `.env` and fill values:

- `PORT`
- `NOTION_MODE` (`api` or `mcp`)
- `NOTION_TOKEN` (required in `api` mode)
- `NOTION_STARTUP_IDEAS_DB_ID`
- `NOTION_COMPETITORS_DB_ID`
- `NOTION_ROADMAP_DB_ID`
- `NOTION_MARKETING_DB_ID`
- `GEMINI_API_KEY`
- `NOTION_MCP_ENDPOINT` (required in `mcp` mode)
- `NOTION_OAUTH_CLIENT_ID` (required in `mcp` mode)
- `NOTION_OAUTH_CLIENT_SECRET` (required in `mcp` mode)
- `NOTION_OAUTH_REDIRECT_URI` (required in `mcp` mode)
- `NOTION_OAUTH_TOKEN` (required in `mcp` mode)
- `NOTION_MCP_TOOL_QUERY_STARTUP_IDEAS` (optional override)
- `NOTION_MCP_TOOL_GET_IDEA` (optional override)
- `NOTION_MCP_TOOL_UPDATE_IDEA_STATUS` (optional override)
- `NOTION_MCP_TOOL_CLAIM_IDEA` (optional override)
- `NOTION_MCP_TOOL_UPSERT_COMPETITORS` (optional override)
- `NOTION_MCP_TOOL_UPSERT_ROADMAP` (optional override)
- `NOTION_MCP_TOOL_UPSERT_MARKETING` (optional override)
- `NOTION_MCP_TOOL_VALIDATE_SCHEMAS` (optional override)
- `NOTION_MCP_TOOL_OUTPUT_COUNTS` (optional override)
- `NOTION_MCP_TOOL_LIST_REVIEW_ITEMS` (optional override)
- `NOTION_MCP_TOOL_UPDATE_OUTPUT_ITEM` (optional override)
- `MCP_PORT` (default `7337`)
- `DEMO_IDEA_PAGE_ID` (optional for `npm run demo:challenge`)
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
npm run mcp
npm run demo:mcp -- <ideaPageId>
npm run demo:challenge -- <ideaPageId>
npm run smoke
```

## Health check

`GET /health`

Example response:

```json
{
  "status": "ok",
  "time": "2026-03-21T10:00:00.000Z",
  "version": "0.2.1"
}
```

## MCP usage

### 1. Run with Notion API mode (default)

- Set `NOTION_MODE=api`
- Provide `NOTION_TOKEN` and database IDs

### 2. Run with Notion MCP hosted mode

- Set `NOTION_MODE=mcp`
- Provide `NOTION_MCP_ENDPOINT`
- Keep database IDs configured (used by tool calls)

### 3. Run Founder MCP server

```bash
npm run mcp
```

Exposed tools:

- `founder.health`
- `founder.inspect_schemas`
- `founder.list_ideas_to_run`
- `founder.claim_idea`
- `founder.run_idea`
- `founder.list_reviews`
- `founder.apply_corrections`

VS Code MCP setup details are documented in `docs/VS_CODE_MCP_SETUP.md`.

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
- `Needs Review` / aliases: `Needs Review`, `Review`, `NeedsReview`, `Revisar`, `Needs review` (checkbox)
- `Correction Notes` / aliases: `Correction Notes`, `Corrections`, `Notes`, `Correction`, `Notas`, `Notas de corrección` (rich text)

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
- If Gemini is rate-limited or unavailable, all generation agents use deterministic fallback paths so workflow can still complete.
- Poller workflow claims each idea before processing to prevent duplicate processing across instances.
- Startup runs schema validation against configured Notion DBs and exits fast when requirements are missing.
- Corrections loop is idempotent by row + notes checksum and protected by in-process lock.

## Human-in-the-loop corrections

1. Generate outputs with `founder.run_idea` or poller workflow.
2. In an output DB row, set `Needs Review` to checked and add `Correction Notes`.
3. Run `founder.list_reviews` to inspect pending corrections.
4. Run `founder.apply_corrections` to regenerate only flagged rows.
5. Updated rows are unflagged (`Needs Review=false`) and correction notes are cleared.

If review columns do not exist, the tools return zero items without crashing.

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
