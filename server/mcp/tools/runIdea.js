function createRunIdeaTool({ notionProvider, workflowEngine }) {
  return async function runIdeaTool(args = {}) {
    const pageId = args.ideaPageId || args.pageId;
    if (!pageId) {
      throw new Error("ideaPageId is required");
    }

    const mode = args.mode || "live";
    const replayRunId = args.replayRunId;
    let replayData = null;
    if (mode === "replay" && replayRunId && typeof notionProvider.getRunById === "function") {
      const previousRun = await notionProvider.getRunById(replayRunId);
      if (previousRun?.artifactJson) {
        try {
          replayData = JSON.parse(previousRun.artifactJson);
        } catch {
          replayData = null;
        }
      }
    }

    const startedAt = Date.now();
    const idea = await notionProvider.getIdeaById(pageId);
    await workflowEngine.runWorkflow(idea, {
      mode,
      replayRunId,
      replayData,
      webSearchEnabled: mode === "live",
      webProvider: mode === "live" ? "tavily" : "none",
    });

    const refreshed = await notionProvider.getIdeaById(pageId);
    const ideasOutputs = await notionProvider.getOutputCounts(pageId);

    return {
      ideaId: pageId,
      mode,
      finalStatus: refreshed.status,
      outputs: ideasOutputs,
      usedFallback: null,
      durationMs: Date.now() - startedAt,
    };
  };
}

module.exports = { createRunIdeaTool };
