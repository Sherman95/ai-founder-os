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

const claimSchema = z.object({
  competitor_name: z.string().min(1),
  claim_type: z.enum([
    "pricing",
    "feature",
    "positioning",
    "target_customer",
    "traction_signal",
    "integration",
    "compliance",
    "other",
  ]),
  claim: z.string().min(1),
  statement: z.string().min(1),
  evidence_urls: z.array(z.string().url()).default([]),
  verdict: z.enum(["supported", "weak", "unknown", "contradicts"]),
  confidence: z.number().min(0).max(1),
  why_it_matters: z.string().min(1),
});

const featureMatrixItemSchema = z.object({
  feature: z.string().min(1),
  competitor_name: z.string().min(1),
  support: z.enum(["yes", "no", "unknown"]),
  evidence_urls: z.array(z.string().url()).default([]),
  confidence: z.number().min(0).max(1),
  feature_category: z.enum([
    "core",
    "integrations",
    "analytics",
    "billing",
    "compliance",
    "automation",
  ]),
  notes: z.string().optional(),
});

const scorecardInputSchema = z.object({
  competitor_name: z.string().min(1),
  similarity_score: z.number().min(0).max(100),
  pricing_clarity: z.number().min(0).max(100),
  evidence_quality: z.number().min(0).max(100),
  traction_signals: z.number().min(0).max(100),
  risk_flags: z
    .array(z.enum(["unclear_pricing", "weak_evidence", "outdated", "non_official", "contradictory"]))
    .default([]),
});

const webResultSchema = z.object({
  query: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string().default(""),
  domain: z.string().default(""),
});

const marketResearchOutputSchema = z.object({
  competitors: z.array(competitorSchema).max(20),
  claims: z.array(claimSchema).max(200).default([]),
  feature_matrix: z.array(featureMatrixItemSchema).max(400).default([]),
  scorecard_inputs: z.array(scorecardInputSchema).max(50).default([]),
  search_queries: z.array(z.string().min(2)).max(20).default([]),
  web_results: z.array(webResultSchema).max(200).default([]),
});

module.exports = {
  competitorSchema,
  claimSchema,
  featureMatrixItemSchema,
  scorecardInputSchema,
  marketResearchOutputSchema,
};
