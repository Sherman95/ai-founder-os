const dotenv = require("dotenv");
const { Client } = require("@notionhq/client");

const notionProvider = require("../services/notionProvider");
const { createWorkflowEngine } = require("../orchestrator/workflowEngine");

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN || process.env.NOTION_OAUTH_TOKEN });

function extractTitle(properties) {
  const titleProp = Object.values(properties || {}).find((v) => v?.type === "title");
  return titleProp?.title?.[0]?.plain_text || "Untitled startup idea";
}

function extractDescription(properties) {
  const desc = properties?.Description;
  if (desc?.type === "rich_text") {
    return desc.rich_text.map((r) => r.plain_text).join(" ").trim();
  }
  return "";
}

function extractStatus(properties) {
  const status = properties?.Status;
  return status?.status?.name || status?.select?.name || status?.multi_select?.[0]?.name || null;
}

async function main() {
  const pageId = process.argv[2];
  if (!pageId) {
    console.error("Usage: node server/scripts/runWorkflowOnce.js <ideaPageId>");
    process.exit(1);
  }

  const page = await notion.pages.retrieve({ page_id: pageId });
  const properties = page.properties || {};
  const idea = {
    id: pageId,
    title: extractTitle(properties),
    description: extractDescription(properties),
    status: extractStatus(properties),
  };

  const engine = createWorkflowEngine({ notionService: notionProvider });
  await engine.runWorkflow(idea);
  console.log("Workflow execution finished for:", pageId);
}

main().catch((error) => {
  console.error("Workflow execution failed:", error?.message || error);
  process.exit(1);
});
