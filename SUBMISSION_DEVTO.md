# AI Founder OS - Notion MCP Challenge Submission

## What it does

AI Founder OS turns Notion into a founder control plane. A startup idea marked `Run` in Notion triggers an orchestrated multi-agent workflow that generates:

- Competitor research
- Product roadmap
- Marketing strategy
- Viability summary and score

## Why MCP

This release introduces MCP integration in two layers:

1. Notion MCP hosted mode (`NOTION_MODE=mcp`) for OAuth-oriented operation.
2. Founder OS as its own MCP server with high-level tools (`founder.*`) for orchestration from MCP clients.

## Architecture

`VS Code MCP client -> Founder OS MCP server -> Notion MCP hosted (or API fallback adapter) -> Notion workspace`

## Founder MCP tools

- `founder.health`
- `founder.inspect_schemas`
- `founder.list_ideas_to_run`
- `founder.claim_idea`
- `founder.run_idea`

## Setup

1. Install dependencies: `npm install`
2. Configure `.env` from `.env.example`
3. Validate: `npm run smoke`
4. Start backend API: `npm run start`
5. Start MCP server: `npm run mcp`

## Demo steps

1. In Notion, set idea status to `Run`
2. Call `founder.list_ideas_to_run`
3. Call `founder.run_idea`
4. Verify outputs in Competitors/Roadmap/Marketing DBs

## Reliability notes

- Claim lock to prevent duplicate execution across instances
- Idempotent upsert behavior
- Gemini retry + repair JSON loop
- Fallback generation paths when quota/rate-limit is hit

## Limits

- Production-ready basic release focused on reliability over throughput
- Throughput is single-loop conservative by default

## Credits

- Notion APIs and Notion MCP hosted endpoint
- Gemini API
- AI Founder OS architecture and implementation by project team
