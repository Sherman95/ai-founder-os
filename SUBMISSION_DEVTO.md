---
title: "AI Founder OS — Turn Notion into a Multi-Agent Startup Command Center"
published: true
tags: notionmcpchallenge
---

## What I Built

**AI Founder OS** is a multi-agent backend that transforms Notion into a full startup operations dashboard. Drop a startup idea into a Notion database, set its status to `Run`, and the system orchestrates four AI agents (powered by Gemini 2.5 Flash) to produce:

- **Competitive intelligence** — grounded on real web search evidence (via Tavily)
- **Product roadmap** — prioritized feature plan with complexity ratings
- **Marketing strategy** — channel-specific campaigns with content ideas
- **Viability scorecard** — 0–100 score with risk flags and executive summary

Everything writes back to Notion databases, creating a living, queryable command center.

## Category Submission

Build with Notion MCP

## App Link

https://github.com/Sherman95/ai-founder-os

## Description

### The Problem

Founders spend weeks doing competitive research, building roadmaps, and creating GTM strategies — manually, across scattered tools. What if your Notion workspace could do all that on autopilot?

### The Solution: Dual-Direction MCP Architecture

AI Founder OS integrates MCP in **two directions**:

**1. As MCP Consumer** — The backend consumes Notion MCP hosted endpoint (`NOTION_MODE=mcp`) for OAuth-based access to workspace databases, with graceful fallback to the direct Notion API.

**2. As MCP Provider** — The system exposes its own MCP server with 10 high-level tools following the MCP standard (JSON Schema `inputSchema`, JSON-RPC 2.0, HTTP + stdio transports):

| Tool | What it does |
|---|---|
| `founder.health` | Service health and runtime metadata |
| `founder.inspect_schemas` | Validate Notion DB requirements before first run |
| `founder.list_ideas_to_run` | List ideas in Run/Queued status |
| `founder.claim_idea` | Lock an idea to prevent duplicate processing |
| `founder.run_idea` | Execute the full 4-agent pipeline (analyze → research → roadmap → marketing) |
| `founder.retry_run` | Re-run a failed workflow in live mode |
| `founder.replay_run` | Replay from a previous run's artifact (skips web search) |
| `founder.get_run` | Audit snapshot with duration, output counts, artifact JSON |
| `founder.list_reviews` | List output rows flagged for human review |
| `founder.apply_corrections` | Re-generate flagged rows using LLM + human correction notes |

### Human-in-the-Loop Corrections

This is where Notion really shines as a UI layer. After the AI generates outputs:

1. A user reviews a competitor row directly in Notion
2. Checks the `Needs Review` checkbox and adds correction instructions in `Correction Notes`
3. Calls `founder.apply_corrections` via MCP
4. The system re-analyzes ONLY that row using the original idea context + correction notes
5. Updated row is written back, flag is cleared

The corrections loop is **idempotent** (checksum-guarded) and **concurrent-safe** (in-process locking).

### Resilience by Design

Every agent has a **deterministic fallback** that activates when Gemini returns 429 (quota exhausted):

```
ideaAnalyzer  → fallback analysis with calibrated scores
marketResearch → fallback competitors from model priors
productPlanner → fallback 3-item roadmap
marketingAgent → fallback LinkedIn/SEO/Email plan
```

The workflow **never crashes** from LLM unavailability — it degrades gracefully and completes.

### Multi-Language Auto-Adaptation

Write your startup idea in Spanish, Portuguese, French, Arabic, Chinese, or any supported language. The system:
1. Detects the input language via script analysis + word frequency
2. Injects a `LANGUAGE` rule into every prompt
3. All AI-generated outputs are returned in the detected language

### WOW Mode: Full Audit Trail

Enable `NOTION_UI_WOW_MODE=true` to create extended audit entities:

- **Runs** — status, timestamps, duration, search queries, error tracking
- **Evidence** — raw web search results with URLs, domains, confidence scores
- **Claims** — competitor claims with verdict (supported/weak/unknown/contradicts)
- **Feature Matrix** — competitor × feature coverage grid
- **Scorecards** — weighted scores with risk flags per competitor

### Architecture

```
VS Code MCP Client
       ↓ (stdio or HTTP)
┌──────────────────────────────┐
│   Founder OS MCP Server      │
│   (10 tools, JSON-RPC 2.0)  │
├──────────────────────────────┤
│   Workflow Engine            │
│   ┌─────────┐ ┌──────────┐  │
│   │Analyzer │→│ Research  │  │──→ Tavily Web Search
│   └─────────┘ └──────────┘  │
│   ┌─────────┐ ┌──────────┐  │
│   │Planner  │ │Marketing │  │──→ Gemini 2.5 Flash
│   └─────────┘ └──────────┘  │
├──────────────────────────────┤
│   Notion Data Layer          │
│   (API or MCP consumer)      │
└──────────────────────────────┘
       ↓ (creates/updates)
┌──────────────────────────────┐
│   Notion Workspace           │
│   ☐ Startup Ideas DB         │
│   ☐ Competitors DB           │
│   ☐ Roadmap DB               │
│   ☐ Marketing DB             │
│   ☐ Runs/Evidence/Claims...  │
└──────────────────────────────┘
```

## How I Built It

### Tech Stack

- **Runtime:** Node.js 18+ with Express 5
- **AI Engine:** Gemini 2.5 Flash via `@google/genai`
- **Database/UI:** Notion via `@notionhq/client` (API mode) or Notion MCP hosted (MCP mode)
- **Web Search:** Tavily API for competitive intelligence grounding
- **Validation:** Zod schemas for every AI output — with auto-repair retry loop (2 retries)
- **Logging:** Pino structured JSON logs
- **Tests:** Node.js built-in test runner (`node:test`)

### Key Design Decisions

**Notion as the entire UI.** No frontend to build, no deployment to manage. Founders already live in Notion — meet them where they are.

**Schema-adaptive data layer.** The system discovers Notion property types at runtime and adapts writes accordingly. It handles `status`, `select`, `multi_select`, `rich_text`, `number`, `checkbox`, `date`, `url`, and `relation` types. Property names are resolved using aliases in English and Spanish.

**Modular service architecture.** The Notion data layer is split into three focused modules:
- `notionHelpers.js` — pure helper functions (no API calls)
- `notionQueries.js` — read operations with caching
- `notionWrites.js` — write/upsert operations with idempotency

**MCP-first operations.** Every operation is exposed as an MCP tool with proper `inputSchema` definitions, making the system composable with any MCP-compatible AI assistant.

## Setup & Demo

```bash
git clone https://github.com/Sherman95/ai-founder-os.git
cd ai-founder-os
npm install
cp .env.example .env
# Fill in your Notion token, DB IDs, and Gemini API key
npm run test        # Run 44 unit tests
npm run dev         # Start API server with poller
npm run mcp         # Start MCP HTTP server (port 7337)
npm run mcp:stdio   # Start MCP stdio transport (for VS Code)
```

### VS Code MCP Configuration

```json
{
  "mcp": {
    "servers": {
      "founder-os": {
        "command": "node",
        "args": ["server/mcp/mcpStdioTransport.js"],
        "cwd": "/path/to/ai-founder-os"
      }
    }
  }
}
```

## What's Next

- Dashboard page in Notion with rollup views across all output databases
- Webhook-based triggers (replace polling with real-time execution)
- Multi-idea batch processing with priority queue
- RAG-enhanced research using founder's own Notion documents as context

## License

MIT
