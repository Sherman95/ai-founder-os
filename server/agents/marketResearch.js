const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { generateJson, isQuotaError } = require("../services/geminiService");
const { competitorListSchema } = require("../schemas/competitor.schema");
const { buildLanguageRule, detectInputLanguage } = require("../services/languageService");

const promptPath = path.resolve(__dirname, "../../prompts/marketResearch.md");

function buildFallbackCompetitors(analysis) {
  const count = Math.min(env.MAX_COMPETITORS, 2);
  const base = [
    {
      name: `${analysis.industry} Incumbent Suite`,
      pricing: "estimate: $49-$299/mo",
      strengths: ["brand recognition", "distribution"],
      weaknesses: ["slower iteration", "legacy UX"],
      notes: "estimate",
    },
    {
      name: `${analysis.industry} Niche Challenger`,
      pricing: "unknown",
      strengths: ["focused onboarding", "fast shipping"],
      weaknesses: ["small brand", "limited integrations"],
      notes: "unknown",
    },
  ];

  return competitorListSchema.parse(base.slice(0, count));
}

async function marketResearch(analysis, options = {}) {
  const systemPrompt = fs.readFileSync(promptPath, "utf8");
  const languageHint = options.languageHint || detectInputLanguage(JSON.stringify(analysis));
  const languageRule = buildLanguageRule({ languageHint });

  const prompt = `${systemPrompt}\n\n${languageRule}\n\nCONSTRAINT: Return at most ${env.MAX_COMPETITORS} competitors.\n\nINPUT:\n${JSON.stringify(
    analysis,
    null,
    2
  )}`;

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
