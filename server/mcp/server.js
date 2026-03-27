const express = require("express");
const pino = require("pino");

const env = require("../config/env");
const { handleJsonRpcRequest, getToolsList, toolHandlers, notionProvider } = require("./mcpCore");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

async function main() {
  await notionProvider.validateConfiguredSchemas();

  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const response = await handleJsonRpcRequest(req.body || {});
    logger.info({ ts: new Date().toISOString(), method: req.body?.method }, "MCP HTTP request");
    res.json(response);
  });

  app.get("/mcp/health", async (_req, res) => {
    res.json(await toolHandlers["founder.health"]());
  });

  app.get("/mcp/tools", async (_req, res) => {
    res.json({ tools: getToolsList() });
  });

  app.listen(env.MCP_PORT, () => {
    logger.info(
      { ts: new Date().toISOString(), mcpPort: env.MCP_PORT, notionMode: env.NOTION_MODE },
      "Founder MCP server running (HTTP transport)"
    );
  });
}

main().catch((error) => {
  logger.error({ ts: new Date().toISOString(), err: error?.message }, "MCP server startup failed");
  process.exit(1);
});
