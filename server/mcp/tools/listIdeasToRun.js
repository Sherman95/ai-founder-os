function createListIdeasToRunTool({ notionProvider }) {
  return async function listIdeasToRunTool() {
    const ideas = await notionProvider.queryStartupIdeasToRun();
    return {
      count: ideas.length,
      ideas: ideas.map((idea) => ({
        id: idea.id,
        title: idea.title,
        status: idea.status,
      })),
    };
  };
}

module.exports = { createListIdeasToRunTool };
