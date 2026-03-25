const { z } = require("zod");
const { competitorSchema } = require("./marketResearchOutput.schema");

const competitorListSchema = z.array(competitorSchema).max(20);

module.exports = {
  competitorSchema,
  competitorListSchema,
};
