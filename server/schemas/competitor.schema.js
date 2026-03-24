const { z } = require("zod");

const competitorSchema = z.object({
  name: z.string().min(1),
  website: z.string().min(1),
  source: z.enum(["web_search", "ai_generated"]),
  pricing: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  search_snippet: z.string().min(1),
  notes: z.string().optional(),
});

const competitorListSchema = z.array(competitorSchema).max(20);

module.exports = {
  competitorSchema,
  competitorListSchema,
};
