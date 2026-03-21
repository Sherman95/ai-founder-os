function createRunIdeaTool({ notionProvider, workflowEngine }) {
  return async function runIdeaTool(args = {}) {
    const pageId = args.ideaPageId || args.pageId;
    if (!pageId) {
      throw new Error("ideaPageId is required");
    }

    const startedAt = Date.now();
    const idea = await notionProvider.getIdeaById(pageId);
    await workflowEngine.runWorkflow(idea);

    const refreshed = await notionProvider.getIdeaById(pageId);
    const ideasOutputs = await notionProvider.getOutputCounts(pageId);

    return {
      ideaId: pageId,
      finalStatus: refreshed.status,
      outputs: ideasOutputs,
      usedFallback: null,
      durationMs: Date.now() - startedAt,
    };
  };
}

module.exports = { createRunIdeaTool };
