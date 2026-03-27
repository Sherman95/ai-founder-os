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
        {
            name: "founder.health",
            description: "Service health and runtime metadata",
            inputSchema: { type: "object", properties: {}, required: [] },
        },
        {
            name: "founder.inspect_schemas",
            description: "Validate Notion schema requirements for all configured databases",
            inputSchema: { type: "object", properties: {}, required: [] },
        },
        {
            name: "founder.list_ideas_to_run",
            description: "List startup ideas in Run/Queued status ready for workflow execution",
            inputSchema: { type: "object", properties: {}, required: [] },
        },
        {
            name: "founder.claim_idea",
            description: "Attempt to claim a specific idea for execution, preventing duplicate runs",
            inputSchema: {
                type: "object",
                properties: {
                    ideaPageId: { type: "string", description: "Notion page ID of the startup idea to claim" },
                },
                required: ["ideaPageId"],
            },
        },
        {
            name: "founder.run_idea",
            description: "Execute one complete multi-agent workflow for a startup idea: analyze → research → roadmap → marketing",
            inputSchema: {
                type: "object",
                properties: {
                    ideaPageId: { type: "string", description: "Notion page ID of the startup idea to process" },
                    mode: { type: "string", enum: ["live", "replay"], description: "Execution mode (default: live)" },
                    replayRunId: { type: "string", description: "Run page ID for replay mode (provides cached web results)" },
                },
                required: ["ideaPageId"],
            },
        },
        {
            name: "founder.retry_run",
            description: "Retry a workflow in live mode for an idea that previously failed",
            inputSchema: {
                type: "object",
                properties: {
                    ideaPageId: { type: "string", description: "Notion page ID of the startup idea to retry" },
                },
                required: ["ideaPageId"],
            },
        },
        {
            name: "founder.replay_run",
            description: "Replay a workflow from a previous run artifact, skipping web search",
            inputSchema: {
                type: "object",
                properties: {
                    ideaPageId: { type: "string", description: "Notion page ID of the startup idea" },
                    replayRunId: { type: "string", description: "Page ID of the previous run to replay from" },
                },
                required: ["ideaPageId", "replayRunId"],
            },
        },
        {
            name: "founder.get_run",
            description: "Get one run audit snapshot including status, duration, outputs counts, and artifact JSON",
            inputSchema: {
                type: "object",
                properties: {
                    runPageId: { type: "string", description: "Notion page ID of the run record" },
                },
                required: ["runPageId"],
            },
        },
        {
            name: "founder.list_reviews",
            description: "List output rows flagged for human review with Needs Review checkbox",
            inputSchema: {
                type: "object",
                properties: {
                    types: {
                        type: "array",
                        items: { type: "string", enum: ["competitor", "roadmap", "marketing"] },
                        description: "Output types to scan (default: all)",
                    },
                    ideaPageId: { type: "string", description: "Optional filter by source idea page ID" },
                    limit: { type: "number", description: "Max items to return (default: 25, max: 100)" },
                },
                required: [],
            },
        },
        {
            name: "founder.apply_corrections",
            description: "Apply human corrections to flagged output rows using LLM regeneration",
            inputSchema: {
                type: "object",
                properties: {
                    types: {
                        type: "array",
                        items: { type: "string", enum: ["competitor", "roadmap", "marketing"] },
                        description: "Output types to correct (default: all)",
                    },
                    ideaPageId: { type: "string", description: "Optional filter by source idea page ID" },
                    limit: { type: "number", description: "Max items to process (default: 10, max: 50)" },
                },
                required: [],
            },
        },
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
            return {
                jsonrpc: "2.0",
                id,
                result: {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
                },
            };
        } catch (error) {
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

module.exports = {
    toolHandlers,
    getToolsList,
    handleJsonRpcRequest,
    notionProvider,
};
