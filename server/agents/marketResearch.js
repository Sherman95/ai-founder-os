const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { generateJson, isQuotaError } = require("../services/geminiService");
const { competitorListSchema } = require("../schemas/competitor.schema");
const { buildLanguageRule, detectInputLanguage } = require("../services/languageService");
const { searchMarketWeb } = require("../services/webSearchService");

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

  return competitorListSchema.parse(base.slice(0, count));
}

async function marketResearch(analysis, options = {}) {
  const systemPrompt = fs.readFileSync(promptPath, "utf8");
  const languageHint = options.languageHint || detectInputLanguage(JSON.stringify(analysis));
  const languageRule = buildLanguageRule({ languageHint });

  const webResults = await searchMarketWeb({
    title: options.ideaTitle,
    description: options.ideaDescription,
    analysis,
  });

  const hasWebResults = webResults.length > 0;

  const prompt = `${systemPrompt}\n\n${languageRule}\n\nCONSTRAINT: Return at most ${env.MAX_COMPETITORS} competitors.\n\nWEB_SEARCH_AVAILABLE: ${hasWebResults}\n\nINPUT:\n${JSON.stringify(
    analysis,
    null,
    2
  )}\n\nWEB_SEARCH_RESULTS:\n${JSON.stringify(webResults, null, 2)}`;

  try {
    const generated = await generateJson({ prompt, schema: competitorListSchema });
    return competitorListSchema.parse(generated.slice(0, env.MAX_COMPETITORS));
  } catch (error) {
    if (isQuotaError(error)) {
      return buildFallbackCompetitors(analysis);
    }
    throw error;
  }
}

module.exports = {
  marketResearch,
};
