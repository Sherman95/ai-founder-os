# AI Founder OS Runbook

## 1. Setup

1. Install dependencies.

```bash
npm install
```

2. Create a local env file.

```bash
cp .env.example .env
```

3. Fill required values in `.env`:
- `NOTION_TOKEN`
- `NOTION_STARTUP_IDEAS_DB_ID`
- `NOTION_COMPETITORS_DB_ID`
- `NOTION_ROADMAP_DB_ID`
- `NOTION_MARKETING_DB_ID`
- `GEMINI_API_KEY`

4. Validate schema connectivity before runtime.

```bash
npm run smoke
```

## 2. Run

Development:

```bash
npm run dev
```

Production-like local run:

```bash
npm run start
```

Pause polling while keeping API up:

```dotenv
DISABLE_POLLER=true
```

## 3. Trigger in Notion

1. Open Startup Ideas DB.
2. Set one idea status to `Run` (or `Queued`).
3. Poller claims it and moves to `Running`.
4. Workflow writes outputs into:
- Competitors
- Roadmap
- Marketing
5. Final status should become `Done` or `Failed`.

## 4. Common Failure Diagnosis

### Notion 401/403

Symptoms:
- Unauthorized or forbidden errors in logs.

Actions:
1. Verify `NOTION_TOKEN` is valid.
2. Confirm integration has access to all 4 DBs.
3. Re-run:

```bash
npm run inspect:schemas
```

### Notion schema mismatch

Symptoms:
- Startup exits with schema validation error.
- Missing property errors during update/upsert.

Actions:
1. Run schema inspection:

```bash
npm run inspect:schemas
```

2. Confirm required fields:
- Startup Ideas: title + workflow status property (`status`/`select`/`multi_select`)
- Outputs: title + `Source Idea` (rich_text)

3. Re-run:

```bash
npm run smoke
```

### Gemini 429 / quota

Symptoms:
- `RESOURCE_EXHAUSTED` or quota/rate-limit logs.

Actions:
1. Confirm API quota and billing status.
2. Keep workflow running: fallback paths will still complete outputs.
3. Retry once quota window resets.

## 5. Key Rotation (Safe)

1. Generate new `NOTION_TOKEN` and `GEMINI_API_KEY`.
2. Update `.env` values.
3. Restart server.
4. Validate with:

```bash
npm run smoke
```

5. Never store real keys in `.env.example` or committed files.

## 6. Operational Commands

Inspect configured Notion schemas:

```bash
npm run inspect:schemas
```

Run one workflow directly for a known page:

```bash
npm run workflow:once -- <ideaPageId>
```

Health check:

```bash
curl http://localhost:3001/health
```
