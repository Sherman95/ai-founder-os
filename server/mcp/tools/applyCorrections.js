const { applyCorrections } = require("../../services/reviewService");

function createApplyCorrectionsTool({ notionProvider }) {
  return async function applyCorrectionsTool(args = {}) {
    const types = Array.isArray(args.types) ? args.types : undefined;
    const ideaPageId = args.ideaPageId || undefined;
    const limit = Number(args.limit || 10);

    return applyCorrections({ notionProvider, types, ideaPageId, limit });
  };
}

module.exports = { createApplyCorrectionsTool };
