const dotenv = require("dotenv");
const { Client } = require("@notionhq/client");

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const databaseTargets = [
  { label: "Startup Ideas", envKey: "NOTION_STARTUP_IDEAS_DB_ID" },
  { label: "Competitors", envKey: "NOTION_COMPETITORS_DB_ID" },
  { label: "Roadmap", envKey: "NOTION_ROADMAP_DB_ID" },
  { label: "Marketing", envKey: "NOTION_MARKETING_DB_ID" },
];

function printProperties(properties) {
  const entries = Object.entries(properties || {});
  if (!entries.length) {
    console.log("  (no properties found)");
    return;
  }

  for (const [name, prop] of entries) {
    console.log(`  - ${name}: ${prop.type}`);
  }
}

async function inspectDatabase({ label, envKey }) {
  const dbId = process.env[envKey];
  if (!dbId) {
    console.log(`\n[${label}] skipped: missing ${envKey}`);
    return;
  }

  console.log(`\n[${label}]`);
  console.log(`  source: ${envKey}`);
  console.log(`  id: ${dbId}`);

  const db = await notion.databases.retrieve({ database_id: dbId });

  const title = (db.title || []).map((t) => t.plain_text).join("") || "(no title)";
  console.log(`  title: ${title}`);

  const dbProperties = db.properties || {};
  const hasDbProperties = Object.keys(dbProperties).length > 0;

  if (hasDbProperties) {
    console.log("  properties (database):");
    printProperties(dbProperties);
    return;
  }

  if (!Array.isArray(db.data_sources) || !db.data_sources[0]?.id) {
    console.log("  properties: unavailable (database has no inline properties or data source)");
    return;
  }

  const dataSourceId = db.data_sources[0].id;
  const dataSourceName = db.data_sources[0].name || "(no name)";
  console.log(`  data source: ${dataSourceName} (${dataSourceId})`);

  if (typeof notion.dataSources?.retrieve !== "function") {
    console.log("  properties: unavailable (SDK dataSources.retrieve not available)");
    return;
  }

  const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
  console.log("  properties (data source):");
  printProperties(ds.properties || {});
}

async function main() {
  if (!process.env.NOTION_TOKEN) {
    console.error("Missing NOTION_TOKEN in environment.");
    process.exit(1);
  }

  console.log("Notion Schema Inspector");
  console.log("======================");

  for (const target of databaseTargets) {
    try {
      await inspectDatabase(target);
    } catch (error) {
      console.error(`\n[${target.label}] error: ${error?.message || error}`);
    }
  }
}

main().catch((error) => {
  console.error(`Fatal error: ${error?.message || error}`);
  process.exit(1);
});
