const pino = require("pino");

const { ideaAnalyzer } = require("../agents/ideaAnalyzer");
const { marketResearch } = require("../agents/marketResearch");
const { productPlanner } = require("../agents/productPlanner");
const { marketingAgent } = require("../agents/marketingAgent");
const { detectInputLanguage } = require("../services/languageService");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

function createWorkflowEngine({ notionService }) {
  return {
    async runWorkflow(ideaPage, options = {}) {
      const runStartedAt = new Date().toISOString();
      const runStartMs = Date.now();
      let claimed = false;
      let runRecord = null;
      let stage = "analyze";

      try {
        const mode = options.mode || "live";
        if (typeof notionService.createRun === "function") {
          runRecord = await notionService.createRun(ideaPage, {
            mode,
            status: "Running",
            startedAt: runStartedAt,
            version: options.version,
            tagRelease: options.tagRelease,
            webSearchEnabled: options.webSearchEnabled,
            webProvider: options.webProvider,
            runNotes: options.runNotes || "",
          });
        }

        claimed = await notionService.claimIdeaForRun(ideaPage.id);
        if (!claimed) {
          if (runRecord && typeof notionService.finalizeRun === "function") {
            await notionService.finalizeRun(runRecord.id, {
              status: "Partial",
              startedAt: runStartedAt,
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - runStartMs,
              runLog: "Workflow skipped because idea was not claimable.",
            });
          }
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

        stage = "analyze";
        const analysis = await ideaAnalyzer(ideaPage, { languageHint });

        stage = "research";
        const research = await marketResearch(analysis, {
          languageHint,
          ideaTitle: ideaPage.title,
          ideaDescription: ideaPage.description,
          replayData: options.replayData,
        });
        const competitors = research.competitors || [];

        stage = "write";
        let evidenceItems = [];
        if (typeof notionService.createOrUpsertEvidence === "function") {
          evidenceItems = await notionService.createOrUpsertEvidence({
            runPageId: runRecord?.id,
            ideaPageId: ideaPage.id,
            evidenceRows: research.web_results || [],
            mode,
          });
        }

        const roadmap = await productPlanner(analysis, { languageHint });
        const marketing = await marketingAgent(analysis, { languageHint });

        await notionService.createOrUpsertCompetitors(ideaPage.id, competitors, {
          runPageId: runRecord?.id,
          evidenceItems,
        });
        await notionService.createOrUpsertRoadmap(ideaPage.id, roadmap);
        await notionService.createOrUpsertMarketing(ideaPage.id, marketing);

        if (typeof notionService.createOrUpsertClaims === "function") {
          await notionService.createOrUpsertClaims({
            runPageId: runRecord?.id,
            ideaPageId: ideaPage.id,
            claims: research.claims || [],
            competitors,
            evidenceItems,
          });
        }

        if (typeof notionService.createOrUpsertFeatureMatrix === "function") {
          await notionService.createOrUpsertFeatureMatrix({
            runPageId: runRecord?.id,
            ideaPageId: ideaPage.id,
            featureMatrix: research.feature_matrix || [],
            competitors,
            evidenceItems,
          });
        }

        if (typeof notionService.createOrUpsertScorecards === "function") {
          await notionService.createOrUpsertScorecards({
            runPageId: runRecord?.id,
            ideaPageId: ideaPage.id,
            scorecardInputs: research.scorecard_inputs || [],
            competitors,
            evidenceItems,
          });
        }

        const outputCounts = await notionService.getOutputCounts(ideaPage.id);
        if (runRecord && typeof notionService.finalizeRun === "function") {
          await notionService.finalizeRun(runRecord.id, {
            status: "Done",
            startedAt: runStartedAt,
            finishedAt: new Date().toISOString(),
            durationMs: Date.now() - runStartMs,
            searchQueries: research.search_queries || [],
            evidenceCount: evidenceItems.length,
            competitorsWritten: outputCounts.competitors,
            roadmapItemsWritten: outputCounts.roadmap,
            marketingItemsWritten: outputCounts.marketing,
            judgeSummary: `Run completed with ${competitors.length} competitors and ${evidenceItems.length} evidence items.`,
            artifactJson: JSON.stringify(
              {
                ideaId: ideaPage.id,
                analysis,
                research,
                roadmap,
                marketing,
              },
              null,
              2
            ),
          });
        }

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
          if (runRecord && typeof notionService.finalizeRun === "function") {
            await notionService.finalizeRun(runRecord.id, {
              status: "Failed",
              startedAt: runStartedAt,
              finishedAt: failedAt,
              durationMs: Date.now() - runStartMs,
              errorStage: stage || "unknown",
              errorMessage: error?.message || "unknown",
              runLog: logMessage,
            });
          }

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
