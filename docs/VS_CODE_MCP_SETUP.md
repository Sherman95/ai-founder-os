# VS Code MCP Setup

## 1. Start Founder MCP server

Make sure `.env` includes MCP runtime values when using `NOTION_MODE=mcp`:

- `NOTION_MCP_ENDPOINT`
- `NOTION_OAUTH_TOKEN`

```bash
npm run mcp
```

Default endpoint:

- `http://localhost:7337/mcp`

Override port with env:

```dotenv
MCP_PORT=7337
```

## 2. Configure MCP server in VS Code

Use your MCP client settings to register:

```json
{
  "servers": {
    "ai-founder-os": {
      "type": "http",
      "url": "http://localhost:7337/mcp"
    }
  }
}
```

## 3. Tools exposed

- `founder.health`
- `founder.inspect_schemas`
- `founder.list_ideas_to_run`
- `founder.claim_idea`
- `founder.run_idea`
- `founder.list_reviews`
- `founder.apply_corrections`

## 4. Example calls

- call `founder.health`
- call `founder.list_ideas_to_run`
- call `founder.run_idea` with `{ "ideaPageId": "<notion-page-id>" }`
- call `founder.list_reviews` with `{ "ideaPageId": "<notion-page-id>", "limit": 25 }`
- call `founder.apply_corrections` with `{ "ideaPageId": "<notion-page-id>", "limit": 10 }`

## 5. Backup demo path

If VS Code MCP panel is not ready, run:

```bash
npm run demo:mcp -- <ideaPageId>
```

Human-in-the-loop demo:

```bash
npm run demo:challenge -- <ideaPageId>
```

The script will pause and ask you to manually flag one row in Notion:

- set `Needs Review` = checked
- add `Correction Notes`
