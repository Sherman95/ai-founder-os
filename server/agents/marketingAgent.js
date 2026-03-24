const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { generateJson, isQuotaError } = require("../services/geminiService");
const { marketingListSchema } = require("../schemas/marketing.schema");
const { buildLanguageRule, detectInputLanguage } = require("../services/languageService");

const promptPath = path.resolve(__dirname, "../../prompts/marketingAgent.md");

function buildFallbackMarketing(analysis) {
  const count = Math.min(env.MAX_MARKETING_ITEMS, 3);
  const base = [
    {
      channel: "LinkedIn",
      strategy: `Founder-led insights about ${analysis.industry}`,
      contentIdea: "Weekly problem/solution post with concrete lessons",
      priority: "High",
    },
    {
      channel: "SEO",
      strategy: `High-intent content for ${analysis.targetUsers}`,
      contentIdea: "Comparison and alternatives page with CTA",
      priority: "Medium",
    },
    {
      channel: "Email",
      strategy: "Lifecycle nurture for activation",
      contentIdea: "3-email onboarding educational sequence",
      priority: "Medium",
    },
  ];

  return marketingListSchema.parse(base.slice(0, count));
}

async function marketingAgent(analysis, options = {}) {
  const systemPrompt = fs.readFileSync(promptPath, "utf8");
  const languageHint = options.languageHint || detectInputLanguage(JSON.stringify(analysis));
  const languageRule = buildLanguageRule({ languageHint });

  const prompt = `${systemPrompt}\n\n${languageRule}\n\nCONSTRAINT: Return at most ${env.MAX_MARKETING_ITEMS} marketing items.\n\nINPUT:\n${JSON.stringify(
    analysis,
    null,
    2
  )}`;

  try {
    const generated = await generateJson({ prompt, schema: marketingListSchema });
    return marketingListSchema.parse(generated.slice(0, env.MAX_MARKETING_ITEMS));
  } catch (error) {
    if (isQuotaError(error)) {
      return buildFallbackMarketing(analysis);
    }
    throw error;
  }
}

module.exports = {
  marketingAgent,
};
