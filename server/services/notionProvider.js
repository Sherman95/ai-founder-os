const env = require("../config/env");
const apiService = require("./notionService");
const mcpService = require("./notionMcpService");

const provider = env.NOTION_MODE === "mcp" ? mcpService : apiService;

module.exports = provider;
