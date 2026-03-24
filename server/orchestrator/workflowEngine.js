const pino = require("pino");

const { ideaAnalyzer } = require("../agents/ideaAnalyzer");
const { marketResearch } = require("../agents/marketResearch");
const { productPlanner } = require("../agents/productPlanner");
const { marketingAgent } = require("../agents/marketingAgent");
const { detectInputLanguage } = require("../services/languageService");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

function createWorkflowEngine({ notionService }) {
  return {
    async runWorkflow(ideaPage) {
      const runStartedAt = new Date().toISOString();
      let claimed = false;

      try {
        claimed = await notionService.claimIdeaForRun(ideaPage.id);
        if (!claimed) {
          logger.info(
            { ts: new Date().toISOString(), ideaId: ideaPage.id },
            "Skipping workflow: idea not claimable"
          );
          return;
        }

        await notionService.updateIdeaStatus(ideaPage.id, "Running", {
          runLog: `Workflow started at ${runStartedAt}`,
          lastRunAt: runStartedAt,
        });

        const languageHint = detectInputLanguage(`${ideaPage.title || ""} ${ideaPage.description || ""}`);

        const analysis = await ideaAnalyzer(ideaPage, { languageHint });
        const competitors = await marketResearch(analysis, {
          languageHint,
          ideaTitle: ideaPage.title,
          ideaDescription: ideaPage.description,
        });
        const roadmap = await productPlanner(analysis, { languageHint });
        const marketing = await marketingAgent(analysis, { languageHint });

        await notionService.createOrUpsertCompetitors(ideaPage.id, competitors);
        await notionService.createOrUpsertRoadmap(ideaPage.id, roadmap);
        await notionService.createOrUpsertMarketing(ideaPage.id, marketing);

        await notionService.updateIdeaStatus(ideaPage.id, "Done", {
          score: analysis.viability.score,
          summary: analysis.executiveSummary,
          runLog: `Workflow completed at ${new Date().toISOString()}`,
        });

        logger.info(
          {
            ts: new Date().toISOString(),
            ideaId: ideaPage.id,
            score: analysis.viability.score,
            competitors: competitors.length,
            roadmap: roadmap.length,
            marketing: marketing.length,
          },
          "Workflow completed"
        );
      } catch (error) {
        const failedAt = new Date().toISOString();
        const logMessage = `Workflow failed at ${failedAt}. Error: ${error?.message || "unknown"}`;

        try {
          if (claimed) {
            await notionService.updateIdeaStatus(ideaPage.id, "Failed", {
              runLog: logMessage,
              lastRunAt: failedAt,
            });
          }
        } catch (statusError) {
          logger.error(
            { ts: new Date().toISOString(), ideaId: ideaPage.id, err: statusError?.message },
            "Failed to set startup idea as Failed"
          );
        }

        logger.error({ ts: new Date().toISOString(), ideaId: ideaPage.id, err: error?.message }, "Workflow failed");
      }
    },
  };
}

module.exports = {
  createWorkflowEngine,
};
