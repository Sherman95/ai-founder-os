const fs = require("fs");
const path = require("path");

const env = require("../config/env");
const { generateJson, isQuotaError } = require("../services/geminiService");
const { roadmapListSchema } = require("../schemas/roadmap.schema");
const { buildLanguageRule, detectInputLanguage } = require("../services/languageService");

const promptPath = path.resolve(__dirname, "../../prompts/productPlanner.md");

function buildFallbackRoadmap(analysis) {
  const count = Math.min(env.MAX_ROADMAP_ITEMS, 3);
  const base = [
    {
      feature: `Core ${analysis.coreValue} MVP`,
      priority: "High",
      complexity: "Medium",
      status: "Planned",
    },
    {
      feature: "Onboarding, analytics, and activation",
      priority: "Medium",
      complexity: "Medium",
      status: "Planned",
    },
    {
      feature: "Integrations and automation",
      priority: "Low",
      complexity: "High",
      status: "Planned",
    },
  ];

  return roadmapListSchema.parse(base.slice(0, count));
}

async function productPlanner(analysis, options = {}) {
  const systemPrompt = fs.readFileSync(promptPath, "utf8");
  const languageHint = options.languageHint || detectInputLanguage(JSON.stringify(analysis));
  const languageRule = buildLanguageRule({ languageHint });

  const prompt = `${systemPrompt}\n\n${languageRule}\n\nCONSTRAINT: Return at most ${env.MAX_ROADMAP_ITEMS} roadmap items.\n\nINPUT:\n${JSON.stringify(
    analysis,
    null,
    2
  )}`;

  try {
    const generated = await generateJson({ prompt, schema: roadmapListSchema });
    return roadmapListSchema.parse(generated.slice(0, env.MAX_ROADMAP_ITEMS));
  } catch (error) {
    if (isQuotaError(error)) {
      return buildFallbackRoadmap(analysis);
    }
    throw error;
  }
}

module.exports = {
  productPlanner,
};
