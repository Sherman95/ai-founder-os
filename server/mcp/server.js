const express = require("express");
const pino = require("pino");

const env = require("../config/env");
const notionProvider = require("../services/notionProvider");
const { createWorkflowEngine } = require("../orchestrator/workflowEngine");

const { createHealthTool } = require("./tools/health");
const { createInspectSchemasTool } = require("./tools/inspectSchemas");
const { createListIdeasToRunTool } = require("./tools/listIdeasToRun");
const { createClaimIdeaTool } = require("./tools/claimIdea");
const { createRunIdeaTool } = require("./tools/runIdea");
const { createRetryRunTool } = require("./tools/retryRun");
const { createReplayRunTool } = require("./tools/replayRun");
const { createGetRunTool } = require("./tools/getRun");
const { createListReviewsTool } = require("./tools/listReviews");
const { createApplyCorrectionsTool } = require("./tools/applyCorrections");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const startedAt = Date.now();

const workflowEngine = createWorkflowEngine({ notionService: notionProvider });

const toolHandlers = {
  "founder.health": createHealthTool({ startedAt }),
  "founder.inspect_schemas": createInspectSchemasTool({ notionProvider }),
  "founder.list_ideas_to_run": createListIdeasToRunTool({ notionProvider }),
  "founder.claim_idea": createClaimIdeaTool({ notionProvider }),
  "founder.run_idea": createRunIdeaTool({ notionProvider, workflowEngine }),
  "founder.retry_run": createRetryRunTool({ notionProvider, workflowEngine }),
  "founder.replay_run": createReplayRunTool({ notionProvider, workflowEngine }),
  "founder.get_run": createGetRunTool({ notionProvider }),
  "founder.list_reviews": createListReviewsTool({ notionProvider }),
  "founder.apply_corrections": createApplyCorrectionsTool({ notionProvider }),
};

function getToolsList() {
  return [
    { name: "founder.health", description: "Service health and runtime metadata" },
    { name: "founder.inspect_schemas", description: "Validate Notion schema requirements" },
    { name: "founder.list_ideas_to_run", description: "List ideas in Run/Queued status" },
    { name: "founder.claim_idea", description: "Attempt to claim a specific idea for execution" },
    { name: "founder.run_idea", description: "Execute one complete workflow for one idea" },
    { name: "founder.retry_run", description: "Retry a workflow in live mode" },
    { name: "founder.replay_run", description: "Replay a workflow from a previous run artifact" },
    { name: "founder.get_run", description: "Get one run audit snapshot by run page id" },
    { name: "founder.list_reviews", description: "List output rows flagged for human review" },
    { name: "founder.apply_corrections", description: "Apply human corrections to flagged output rows" },
  ];
}

async function handleJsonRpcRequest(body) {
  const method = body?.method;
  const id = body?.id ?? null;

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: { tools: getToolsList() },
    };
  }

  if (method === "tools/call") {
    const toolName = body?.params?.name;
    const args = body?.params?.arguments || {};
    const handler = toolHandlers[toolName];

    if (!handler) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      };
    }

    try {
      const result = await handler(args);
      logger.info({ ts: new Date().toISOString(), tool: toolName, args }, "MCP tool executed");
      return {
        jsonrpc: "2.0",
        id,
        result,
      };
    } catch (error) {
      logger.error({ ts: new Date().toISOString(), tool: toolName, err: error?.message }, "MCP tool failed");
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: error?.message || "Tool execution failed" },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Unsupported method: ${method}` },
  };
}

async function main() {
  await notionProvider.validateConfiguredSchemas();

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const response = await handleJsonRpcRequest(req.body || {});
    res.json(response);
  });

  app.get("/mcp/health", async (_req, res) => {
    res.json(await toolHandlers["founder.health"]());
  });

  app.listen(env.MCP_PORT, () => {
    logger.info(
      { ts: new Date().toISOString(), mcpPort: env.MCP_PORT, notionMode: env.NOTION_MODE },
      "Founder MCP server running"
    );
  });
}

main().catch((error) => {
  logger.error({ ts: new Date().toISOString(), err: error?.message }, "MCP server startup failed");
  process.exit(1);
});
