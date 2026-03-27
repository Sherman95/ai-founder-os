const { Client } = require("@notionhq/client");
const dotenv = require("dotenv");

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

function undash(id) {
  return String(id || "").replace(/-/g, "");
}

async function createDatabase({ parentPageId, title, properties }) {
  return notion.databases.create({
    parent: { type: "page_id", page_id: parentPageId },
    title: [{ type: "text", text: { content: title } }],
    initial_data_source: {
      properties,
    },
  });
}

async function resolveDataSourceId(databaseId) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  return db?.data_sources?.[0]?.id || databaseId;
}

async function main() {
  const parentPageId = process.env.NOTION_SCHEMA_PARENT_PAGE_ID;
  const startupIdeasDbId = process.env.NOTION_STARTUP_IDEAS_DB_ID;

  if (!process.env.NOTION_TOKEN) throw new Error("Missing NOTION_TOKEN");
  if (!parentPageId) throw new Error("Missing NOTION_SCHEMA_PARENT_PAGE_ID");
  if (!startupIdeasDbId) throw new Error("Missing NOTION_STARTUP_IDEAS_DB_ID");

  const startupIdeasDataSourceId = await resolveDataSourceId(startupIdeasDbId);

  const runs = await createDatabase({
    parentPageId,
    title: "Runs",
    properties: {
      "Run ID": { title: {} },
      "Idea": { relation: { data_source_id: startupIdeasDataSourceId, single_property: {} } },
      "Status": {
        select: {
          options: [
            { name: "Queued" },
            { name: "Running" },
            { name: "Done" },
            { name: "Failed" },
            { name: "Partial" },
          ],
        },
      },
      "Mode": {
        select: { options: [{ name: "live" }, { name: "replay" }, { name: "deterministic" }] },
      },
      "Web Search Enabled": { checkbox: {} },
      "Web Provider": { select: { options: [{ name: "tavily" }, { name: "mock" }, { name: "none" }] } },
      "Started At": { date: {} },
      "Finished At": { date: {} },
      "Duration (ms)": { number: { format: "number" } },
      "Version": { rich_text: {} },
      "Tag/Release": { url: {} },
      "Error Stage": {
        select: {
          options: [
            { name: "analyze" },
            { name: "search" },
            { name: "research" },
            { name: "write" },
            { name: "corrections" },
            { name: "unknown" },
          ],
        },
      },
      "Error Message": { rich_text: {} },
      "Run Log": { rich_text: {} },
      "Artifact JSON": { rich_text: {} },
      "Search Queries": { rich_text: {} },
      "Evidence Count": { number: { format: "number" } },
      "Competitors Written": { number: { format: "number" } },
      "Roadmap Items Written": { number: { format: "number" } },
      "Marketing Items Written": { number: { format: "number" } },
      "Judge Summary": { rich_text: {} },
      "Key": { rich_text: {} },
    },
  });

  const evidence = await createDatabase({
    parentPageId,
    title: "Evidence",
    properties: {
      "Evidence ID": { title: {} },
      "Idea": { relation: { data_source_id: startupIdeasDataSourceId, single_property: {} } },
      "Run": { rich_text: {} },
      "Competitor": { rich_text: {} },
      "Query": { rich_text: {} },
      "Title": { rich_text: {} },
      "URL": { url: {} },
      "Domain": { rich_text: {} },
      "Snippet": { rich_text: {} },
      "Retrieved At": { date: {} },
      "Source Type": {
        select: {
          options: [
            { name: "web_search" },
            { name: "doc_page" },
            { name: "pricing_page" },
            { name: "review" },
            { name: "marketplace" },
            { name: "social" },
            { name: "ai_generated" },
          ],
        },
      },
      "Confidence": { number: { format: "number" } },
      "Is Official Site": { checkbox: {} },
      "Notes": { rich_text: {} },
      "Key": { rich_text: {} },
    },
  });

  const claims = await createDatabase({
    parentPageId,
    title: "Claims",
    properties: {
      Claim: { title: {} },
      "Idea": { relation: { data_source_id: startupIdeasDataSourceId, single_property: {} } },
      "Run": { rich_text: {} },
      "Competitor": { rich_text: {} },
      "Claim Type": {
        select: {
          options: [
            { name: "pricing" },
            { name: "feature" },
            { name: "positioning" },
            { name: "target_customer" },
            { name: "traction_signal" },
            { name: "integration" },
            { name: "compliance" },
            { name: "other" },
          ],
        },
      },
      "Statement": { rich_text: {} },
      "Verdict": {
        select: { options: [{ name: "supported" }, { name: "weak" }, { name: "unknown" }, { name: "contradicts" }] },
      },
      "Evidence": { rich_text: {} },
      "Confidence": { number: { format: "number" } },
      "Why it matters": { rich_text: {} },
      "Needs Review": { checkbox: {} },
      "Correction Notes": { rich_text: {} },
      "Key": { rich_text: {} },
    },
  });

  const matrix = await createDatabase({
    parentPageId,
    title: "Feature Matrix",
    properties: {
      "Feature": { title: {} },
      "Idea": { relation: { data_source_id: startupIdeasDataSourceId, single_property: {} } },
      "Run": { rich_text: {} },
      "Competitor": { rich_text: {} },
      "Support": { select: { options: [{ name: "yes" }, { name: "no" }, { name: "unknown" }] } },
      "Evidence": { rich_text: {} },
      "Notes": { rich_text: {} },
      "Confidence": { number: { format: "number" } },
      "Feature Category": {
        select: {
          options: [
            { name: "core" },
            { name: "integrations" },
            { name: "analytics" },
            { name: "billing" },
            { name: "compliance" },
            { name: "automation" },
          ],
        },
      },
      "Key": { rich_text: {} },
    },
  });

  const scorecards = await createDatabase({
    parentPageId,
    title: "Competitor Scorecards",
    properties: {
      "Scorecard": { title: {} },
      "Idea": { relation: { data_source_id: startupIdeasDataSourceId, single_property: {} } },
      "Run": { rich_text: {} },
      "Competitor": { rich_text: {} },
      "Overall Score": { number: { format: "number" } },
      "Similarity Score": { number: { format: "number" } },
      "Pricing Clarity": { number: { format: "number" } },
      "Evidence Quality": { number: { format: "number" } },
      "Traction Signals": { number: { format: "number" } },
      "Risk Flags": {
        multi_select: {
          options: [
            { name: "unclear_pricing" },
            { name: "weak_evidence" },
            { name: "outdated" },
            { name: "non_official" },
            { name: "contradictory" },
          ],
        },
      },
      "Summary": { rich_text: {} },
      "Top Evidence": { rich_text: {} },
      "Key": { rich_text: {} },
    },
  });

  console.log("Done. Add these to .env:");
  console.log(`NOTION_RUNS_DB_ID=${undash(runs.id)}`);
  console.log(`NOTION_EVIDENCE_DB_ID=${undash(evidence.id)}`);
  console.log(`NOTION_CLAIMS_DB_ID=${undash(claims.id)}`);
  console.log(`NOTION_FEATURE_MATRIX_DB_ID=${undash(matrix.id)}`);
  console.log(`NOTION_SCORECARDS_DB_ID=${undash(scorecards.id)}`);
  console.log("NOTION_UI_WOW_MODE=true");
}

main().catch((err) => {
  console.error("Bootstrap failed:", err.message || err);
  process.exit(1);
});
