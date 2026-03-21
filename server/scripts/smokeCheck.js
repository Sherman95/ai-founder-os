const fs = require("fs");
const path = require("path");
const pino = require("pino");

const env = require("../config/env");
const notionProvider = require("../services/notionProvider");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const promptFiles = [
  path.resolve(__dirname, "../../prompts/ideaAnalyzer.md"),
  path.resolve(__dirname, "../../prompts/marketResearch.md"),
  path.resolve(__dirname, "../../prompts/productPlanner.md"),
  path.resolve(__dirname, "../../prompts/marketingAgent.md"),
];

async function main() {
  logger.info({ ts: new Date().toISOString(), port: env.PORT }, "Running smoke checks");

  const missingPrompts = promptFiles.filter((filePath) => !fs.existsSync(filePath));
  if (missingPrompts.length) {
    throw new Error(`Missing prompt files: ${missingPrompts.join(", ")}`);
  }

  await notionProvider.validateConfiguredSchemas();

  logger.info({ ts: new Date().toISOString() }, "Smoke checks passed");
}

main().catch((error) => {
  logger.error({ ts: new Date().toISOString(), err: error?.message }, "Smoke checks failed");
  process.exit(1);
});
