function createReplayRunTool({ notionProvider, workflowEngine }) {
  return async function replayRunTool(args = {}) {
    const replayRunId = args.runId || args.replayRunId;
    const ideaPageId = args.ideaPageId || args.pageId;

    if (!replayRunId) {
      throw new Error("runId is required");
    }
    if (!ideaPageId) {
      throw new Error("ideaPageId is required");
    }

    const previousRun = await notionProvider.getRunById(replayRunId);
    if (!previousRun) {
      throw new Error(`Run not found: ${replayRunId}`);
    }

    let replayData = null;
    if (previousRun.artifactJson) {
      try {
        replayData = JSON.parse(previousRun.artifactJson);
      } catch {
        replayData = null;
      }
    }

    const startedAt = Date.now();
    const idea = await notionProvider.getIdeaById(ideaPageId);
    await workflowEngine.runWorkflow(idea, {
      mode: "replay",
      replayRunId,
      replayData,
      webSearchEnabled: false,
      webProvider: "none",
      runNotes: `Replay from run ${replayRunId}`,
    });

    const refreshed = await notionProvider.getIdeaById(ideaPageId);
    return {
      ideaId: ideaPageId,
      sourceRunId: replayRunId,
      mode: "replay",
      finalStatus: refreshed.status,
      durationMs: Date.now() - startedAt,
    };
  };
}

module.exports = { createReplayRunTool };
