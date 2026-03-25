function createRetryRunTool({ notionProvider, workflowEngine }) {
  return async function retryRunTool(args = {}) {
    const ideaPageId = args.ideaPageId || args.pageId;
    if (!ideaPageId) {
      throw new Error("ideaPageId is required");
    }

    const startedAt = Date.now();
    const idea = await notionProvider.getIdeaById(ideaPageId);
    await workflowEngine.runWorkflow(idea, {
      mode: "live",
      webSearchEnabled: true,
      webProvider: "tavily",
      runNotes: "Retry run requested via MCP",
    });

    const refreshed = await notionProvider.getIdeaById(ideaPageId);
    return {
      ideaId: ideaPageId,
      mode: "live",
      finalStatus: refreshed.status,
      durationMs: Date.now() - startedAt,
    };
  };
}

module.exports = { createRetryRunTool };
