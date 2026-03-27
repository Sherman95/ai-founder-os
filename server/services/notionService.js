/**
 * Notion service barrel file.
 *
 * Re-exports all public API from the three submodules:
 *   - notionHelpers  (pure helpers, data transforms, aliases)
 *   - notionQueries  (read/query operations, caches)
 *   - notionWrites   (write/upsert operations)
 *
 * All existing `require('./notionService')` references remain backward-compatible.
 */

const queries = require("./notionQueries");
const writes = require("./notionWrites");

module.exports = {
  // Queries
  queryStartupIdeasToRun: queries.queryStartupIdeasToRun,
  getIdeaById: queries.getIdeaById,
  getOutputCounts: queries.getOutputCounts,
  listReviewItems: queries.listReviewItems,
  getRunById: queries.getRunById,

  // Writes
  updateIdeaStatus: writes.updateIdeaStatus,
  claimIdeaForRun: writes.claimIdeaForRun,
  validateConfiguredSchemas: writes.validateConfiguredSchemas,
  inspectSchemas: writes.validateConfiguredSchemas,
  createOrUpsertCompetitors: writes.createOrUpsertCompetitors,
  createOrUpsertRoadmap: writes.createOrUpsertRoadmap,
  createOrUpsertMarketing: writes.createOrUpsertMarketing,
  createRun: writes.createRun,
  updateRun: writes.updateRun,
  finalizeRun: writes.finalizeRun,
  createOrUpsertEvidence: writes.createOrUpsertEvidence,
  createOrUpsertClaims: writes.createOrUpsertClaims,
  createOrUpsertFeatureMatrix: writes.createOrUpsertFeatureMatrix,
  createOrUpsertScorecards: writes.createOrUpsertScorecards,
  updateOutputItemByPageId: writes.updateOutputItemByPageId,
};
