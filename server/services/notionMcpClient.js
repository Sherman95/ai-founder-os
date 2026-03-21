const pino = require("pino");

const env = require("../config/env");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

async function callMcpTool({ toolName, input }) {
  if (!toolName) {
    throw new Error("Notion MCP tool name is not configured");
  }

  const authToken = env.NOTION_OAUTH_TOKEN;
  if (!authToken) {
    throw new Error("NOTION_OAUTH_TOKEN is required for NOTION_MODE=mcp");
  }

  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/call",
    params: {
      name: toolName,
      arguments: input || {},
    },
  };

  const response = await fetch(env.NOTION_MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion MCP HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`Notion MCP tool error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  return json.result;
}

async function listMcpTools() {
  const authToken = env.NOTION_OAUTH_TOKEN;
  if (!authToken) {
    throw new Error("NOTION_OAUTH_TOKEN is required for NOTION_MODE=mcp");
  }

  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "tools/list",
    params: {},
  };

  const response = await fetch(env.NOTION_MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion MCP HTTP ${response.status}: ${text.slice(0, 500)}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(`Notion MCP tools/list error: ${json.error.message || JSON.stringify(json.error)}`);
  }

  return json.result?.tools || [];
}

function isMcpToolConfigured(toolName) {
  return Boolean(toolName && String(toolName).trim());
}

function logMcpFallback(error, operation) {
  logger.warn(
    { ts: new Date().toISOString(), operation, err: error?.message },
    "Falling back to Notion API adapter in MCP mode"
  );
}

module.exports = {
  callMcpTool,
  listMcpTools,
  isMcpToolConfigured,
  logMcpFallback,
};
