function createGetRunTool({ notionProvider }) {
  return async function getRunTool(args = {}) {
    const runId = args.runId || args.pageId;
    if (!runId) {
      throw new Error("runId is required");
    }

    const run = await notionProvider.getRunById(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    return run;
  };
}

module.exports = { createGetRunTool };
