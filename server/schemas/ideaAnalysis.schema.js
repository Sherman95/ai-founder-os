const { z } = require("zod");

const viabilitySchema = z.object({
  demand: z.number().min(0).max(10),
  competition: z.number().min(0).max(10),
  monetizationClarity: z.number().min(0).max(10),
  executionComplexity: z.number().min(0).max(10),
  score: z.number().min(0).max(100),
});

const ideaAnalysisSchema = z.object({
  industry: z.string().min(1),
  targetUsers: z.string().min(1),
  coreValue: z.string().min(1),
  monetization: z.string().min(1),
  risks: z.array(z.string()).min(1),
  executiveSummary: z.string().min(1),
  viability: viabilitySchema,
});

module.exports = {
  ideaAnalysisSchema,
  viabilitySchema,
};
