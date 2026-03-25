const pino = require("pino");

const env = require("../config/env");
const apiService = require("./notionService");
const { callMcpTool, isMcpToolConfigured, logMcpFallback } = require("./notionMcpClient");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

async function runMcpOrFallback({ operation, toolName, input, fallbackFn }) {
  if (!isMcpToolConfigured(toolName)) {
    return fallbackFn();
  }

  try {
    const result = await callMcpTool({ toolName, input });
    return result;
  } catch (error) {
    logMcpFallback(error, operation);
    return fallbackFn();
  }
}

async function queryStartupIdeasToRun() {
  const result = await runMcpOrFallback({
    operation: "queryStartupIdeasToRun",
    toolName: env.NOTION_MCP_TOOL_QUERY_STARTUP_IDEAS,
    input: { statusValues: ["Run", "Queued"] },
    fallbackFn: () => apiService.queryStartupIdeasToRun(),
  });

  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.ideas)) {
    return result.ideas;
  }

  return apiService.queryStartupIdeasToRun();
}

async function getIdeaById(pageId) {
  const result = await runMcpOrFallback({
    operation: "getIdeaById",
    toolName: env.NOTION_MCP_TOOL_GET_IDEA,
    input: { pageId },
    fallbackFn: () => apiService.getIdeaById(pageId),
  });

  return result?.idea || result;
}

async function updateIdeaStatus(pageId, status, extraProps = {}) {
  await runMcpOrFallback({
    operation: "updateIdeaStatus",
    toolName: env.NOTION_MCP_TOOL_UPDATE_IDEA_STATUS,
    input: { pageId, status, extraProps },
    fallbackFn: () => apiService.updateIdeaStatus(pageId, status, extraProps),
  });
}

async function claimIdeaForRun(pageId) {
  const result = await runMcpOrFallback({
    operation: "claimIdeaForRun",
    toolName: env.NOTION_MCP_TOOL_CLAIM_IDEA,
    input: { pageId },
    fallbackFn: () => apiService.claimIdeaForRun(pageId),
  });

  if (typeof result === "boolean") {
    return result;
  }
  if (typeof result?.claimed === "boolean") {
    return result.claimed;
  }

  return false;
}

async function createOrUpsertCompetitors(ideaPageId, competitors) {
  await runMcpOrFallback({
    operation: "createOrUpsertCompetitors",
    toolName: env.NOTION_MCP_TOOL_UPSERT_COMPETITORS,
    input: { ideaPageId, competitors },
    fallbackFn: () => apiService.createOrUpsertCompetitors(ideaPageId, competitors),
  });
}

async function createOrUpsertRoadmap(ideaPageId, roadmapItems) {
  await runMcpOrFallback({
    operation: "createOrUpsertRoadmap",
    toolName: env.NOTION_MCP_TOOL_UPSERT_ROADMAP,
    input: { ideaPageId, roadmapItems },
    fallbackFn: () => apiService.createOrUpsertRoadmap(ideaPageId, roadmapItems),
  });
}

async function createOrUpsertMarketing(ideaPageId, marketingItems) {
  await runMcpOrFallback({
    operation: "createOrUpsertMarketing",
    toolName: env.NOTION_MCP_TOOL_UPSERT_MARKETING,
    input: { ideaPageId, marketingItems },
    fallbackFn: () => apiService.createOrUpsertMarketing(ideaPageId, marketingItems),
  });
}

async function validateConfiguredSchemas() {
  try {
    await runMcpOrFallback({
      operation: "validateConfiguredSchemas",
      toolName: env.NOTION_MCP_TOOL_VALIDATE_SCHEMAS,
      input: {},
      fallbackFn: () => apiService.validateConfiguredSchemas(),
    });
  } catch (error) {
    logger.error({ ts: new Date().toISOString(), err: error?.message }, "MCP schema validation failed");
    throw error;
  }
}

async function getOutputCounts(ideaPageId) {
  const result = await runMcpOrFallback({
    operation: "getOutputCounts",
    toolName: env.NOTION_MCP_TOOL_OUTPUT_COUNTS,
    input: { ideaPageId },
    fallbackFn: () => apiService.getOutputCounts(ideaPageId),
  });

  if (result?.outputs) {
    return result.outputs;
  }

  return result;
}

async function listReviewItems(input = {}) {
  const result = await runMcpOrFallback({
    operation: "listReviewItems",
    toolName: env.NOTION_MCP_TOOL_LIST_REVIEW_ITEMS,
    input,
    fallbackFn: () => apiService.listReviewItems(input),
  });

  if (Array.isArray(result)) {
    return result;
  }
  if (Array.isArray(result?.items)) {
    return result.items;
  }

  return [];
}

async function updateOutputItemByPageId(input = {}) {
  await runMcpOrFallback({
    operation: "updateOutputItemByPageId",
    toolName: env.NOTION_MCP_TOOL_UPDATE_OUTPUT_ITEM,
    input,
    fallbackFn: () => apiService.updateOutputItemByPageId(input),
  });
}

async function createRun(ideaPage, meta = {}) {
  return apiService.createRun(ideaPage, meta);
}

async function updateRun(runPageId, patch = {}) {
  return apiService.updateRun(runPageId, patch);
}

async function finalizeRun(runPageId, patch = {}) {
  return apiService.finalizeRun(runPageId, patch);
}

async function createOrUpsertEvidence(input = {}) {
  return apiService.createOrUpsertEvidence(input);
}

async function createOrUpsertClaims(input = {}) {
  return apiService.createOrUpsertClaims(input);
}

async function createOrUpsertFeatureMatrix(input = {}) {
  return apiService.createOrUpsertFeatureMatrix(input);
}

async function createOrUpsertScorecards(input = {}) {
  return apiService.createOrUpsertScorecards(input);
}

async function getRunById(runPageId) {
  return apiService.getRunById(runPageId);
}

module.exports = {
  queryStartupIdeasToRun,
  getIdeaById,
  updateIdeaStatus,
  claimIdeaForRun,
  createOrUpsertCompetitors,
  createOrUpsertRoadmap,
  createOrUpsertMarketing,
  getOutputCounts,
  listReviewItems,
  updateOutputItemByPageId,
  createRun,
  updateRun,
  finalizeRun,
  createOrUpsertEvidence,
  createOrUpsertClaims,
  createOrUpsertFeatureMatrix,
  createOrUpsertScorecards,
  getRunById,
  validateConfiguredSchemas,
  inspectSchemas: validateConfiguredSchemas,
};
