const { listReviews } = require("../../services/reviewService");

function createListReviewsTool({ notionProvider }) {
  return async function listReviewsTool(args = {}) {
    const types = Array.isArray(args.types) ? args.types : undefined;
    const ideaPageId = args.ideaPageId || undefined;
    const limit = Number(args.limit || 25);

    return listReviews({ notionProvider, types, ideaPageId, limit });
  };
}

module.exports = { createListReviewsTool };
