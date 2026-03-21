const { z } = require("zod");

const competitorSchema = z.object({
  name: z.string().min(1),
  pricing: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  weaknesses: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

const competitorListSchema = z.array(competitorSchema).max(20);

module.exports = {
  competitorSchema,
  competitorListSchema,
};
