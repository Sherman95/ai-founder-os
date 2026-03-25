const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { generateJson, isQuotaError } = require("../services/geminiService");
const { marketResearchOutputSchema } = require("../schemas/marketResearchOutput.schema");
const { buildLanguageRule, detectInputLanguage } = require("../services/languageService");
const { searchMarketWeb } = require("../services/webSearchService");
const { buildSearchQueries } = require("../services/searchQueryBuilder");

const promptPath = path.resolve(__dirname, "../../prompts/marketResearch.md");

function buildFallbackCompetitors(analysis) {
  const count = Math.min(env.MAX_COMPETITORS, 2);
  const base = [
    {
      name: `${analysis.industry} Incumbent Suite`,
      website: "unknown",
      source: "ai_generated",
      pricing: "estimate: $49-$299/mo",
      strengths: ["brand recognition", "distribution"],
      weaknesses: ["slower iteration", "legacy UX"],
      search_snippet: "No web results available. Generated from model prior knowledge.",
      notes: "estimate",
    },
    {
      name: `${analysis.industry} Niche Challenger`,
      website: "unknown",
      source: "ai_generated",
      pricing: "unknown",
      strengths: ["focused onboarding", "fast shipping"],
      weaknesses: ["small brand", "limited integrations"],
      search_snippet: "No web results available. Generated from model prior knowledge.",
      notes: "unknown",
    },
  ];

  return base.slice(0, count);
}

function buildFallbackOutput(analysis, webResults, searchQueries) {
  const competitors = buildFallbackCompetitors(analysis);
  const claims = competitors.map((item) => ({
    competitor_name: item.name,
    claim_type: "positioning",
    claim: `Likely positioned in ${analysis.industry}`,
    statement: `Competitor appears relevant for ${analysis.industry} based on available model context.`,
    evidence_urls: [],
    verdict: "unknown",
    confidence: 0.35,
    why_it_matters: "Indicates adjacent or direct market pressure.",
  }));

  const feature_matrix = [];
  const scorecard_inputs = competitors.map((item) => ({
    competitor_name: item.name,
    similarity_score: 50,
    pricing_clarity: item.pricing === "unknown" ? 25 : 60,
    evidence_quality: item.source === "web_search" ? 60 : 25,
    traction_signals: 40,
    risk_flags: item.source === "web_search" ? ["weak_evidence"] : ["weak_evidence", "non_official"],
  }));

  return marketResearchOutputSchema.parse({
    competitors,
    claims,
    feature_matrix,
    scorecard_inputs,
    search_queries: searchQueries,
    web_results: webResults,
  });
}

async function marketResearch(analysis, options = {}) {
  const systemPrompt = fs.readFileSync(promptPath, "utf8");
  const languageHint = options.languageHint || detectInputLanguage(JSON.stringify(analysis));
  const languageRule = buildLanguageRule({ languageHint });

  if (options.replayData?.research) {
    const replayResearch = options.replayData.research;
    return marketResearchOutputSchema.parse({
      competitors: replayResearch.competitors || [],
      claims: replayResearch.claims || [],
      feature_matrix: replayResearch.feature_matrix || [],
      scorecard_inputs: replayResearch.scorecard_inputs || [],
      search_queries: replayResearch.search_queries || [],
      web_results: replayResearch.web_results || [],
    });
  }

  const webResults = await searchMarketWeb({
    title: options.ideaTitle,
    description: options.ideaDescription,
    analysis,
  });
  const searchQueries = await buildSearchQueries({
    title: options.ideaTitle,
    description: options.ideaDescription,
    analysis,
  });

  const hasWebResults = webResults.length > 0;

  const prompt = `${systemPrompt}\n\n${languageRule}\n\nCONSTRAINT: Return at most ${env.MAX_COMPETITORS} competitors.\n\nWEB_SEARCH_AVAILABLE: ${hasWebResults}\n\nSEARCH_QUERIES:\n${JSON.stringify(
    searchQueries,
    null,
    2
  )}\n\nINPUT:\n${JSON.stringify(
    analysis,
    null,
    2
  )}\n\nWEB_SEARCH_RESULTS:\n${JSON.stringify(webResults, null, 2)}`;

  try {
    const generated = await generateJson({ prompt, schema: marketResearchOutputSchema });
    return marketResearchOutputSchema.parse({
      ...generated,
      competitors: generated.competitors.slice(0, env.MAX_COMPETITORS),
      search_queries: generated.search_queries?.length ? generated.search_queries : searchQueries,
      web_results: webResults,
    });
  } catch (error) {
    if (isQuotaError(error)) {
      return buildFallbackOutput(analysis, webResults, searchQueries);
    }
    throw error;
  }
}

module.exports = {
  marketResearch,
};
