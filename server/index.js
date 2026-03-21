const express = require("express");
const cors = require("cors");
const pino = require("pino");

const env = require("./config/env");
const healthRoute = require("./routes/health");
const notionService = require("./services/notionService");
const { createWorkflowEngine } = require("./orchestrator/workflowEngine");
const { createPoller } = require("./orchestrator/poller");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

const app = express();
app.use(cors());
app.use(express.json());
app.use(healthRoute);

const workflowEngine = createWorkflowEngine({ notionService });
const poller = createPoller({
  intervalMs: env.POLL_INTERVAL_MS,
  queryFn: notionService.queryStartupIdeasToRun,
  runFn: workflowEngine.runWorkflow,
});

async function bootstrap() {
  await notionService.validateConfiguredSchemas();

  app.listen(env.PORT, () => {
    logger.info(
      {
        ts: new Date().toISOString(),
        port: env.PORT,
        pollMs: env.POLL_INTERVAL_MS,
        disablePoller: Boolean(env.DISABLE_POLLER),
      },
      "AI Founder OS server running"
    );

    if (env.DISABLE_POLLER) {
      logger.warn({ ts: new Date().toISOString() }, "Poller is disabled via DISABLE_POLLER=true");
      return;
    }

    poller.start();
  });
}

bootstrap().catch((error) => {
  logger.error({ ts: new Date().toISOString(), err: error?.message }, "Startup schema validation failed");
  process.exit(1);
});

process.on("SIGINT", () => {
  poller.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  poller.stop();
  process.exit(0);
});
