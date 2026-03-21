function createClaimIdeaTool({ notionProvider }) {
  return async function claimIdeaTool(args = {}) {
    const pageId = args.ideaPageId || args.pageId;
    if (!pageId) {
      throw new Error("ideaPageId is required");
    }

    const claimed = await notionProvider.claimIdeaForRun(pageId);
    return {
      ideaId: pageId,
      claimed,
      time: new Date().toISOString(),
    };
  };
}

module.exports = { createClaimIdeaTool };
