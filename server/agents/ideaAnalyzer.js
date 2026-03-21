const fs = require("fs");
const path = require("path");

const { generateJson } = require("../services/geminiService");
const { ideaAnalysisSchema } = require("../schemas/ideaAnalysis.schema");

const promptPath = path.resolve(__dirname, "../../prompts/ideaAnalyzer.md");

function buildFallbackAnalysis(idea) {
  const title = idea.title || "Startup idea";
  const description = idea.description || "No description provided.";

  return ideaAnalysisSchema.parse({
    industry: "General SaaS",
    targetUsers: "SMBs and startup operators",
    coreValue: `${title} helps users solve a high-friction workflow with faster execution and lower manual effort.`,
    monetization: "SaaS subscription with tiered pricing",
    risks: [
      "Demand signal may be weaker than expected without customer interviews.",
      "Competitive differentiation needs clearer positioning.",
      "Execution complexity can increase with integrations.",
    ],
    executiveSummary: `${title} is being processed with a fallback model path because LLM generation is temporarily unavailable. The product thesis appears viable for early validation if scope is kept focused on one painful workflow. Near-term success depends on rapid customer feedback and disciplined prioritization. Description context: ${description}`,
    viability: {
      demand: 6,
      competition: 6,
      monetizationClarity: 7,
      executionComplexity: 6,
      score: 62,
    },
  });
}

async function ideaAnalyzer(idea) {
  const systemPrompt = fs.readFileSync(promptPath, "utf8");
  const prompt = `${systemPrompt}\n\nINPUT IDEA:\n${JSON.stringify(
    {
      id: idea.id,
      title: idea.title,
      description: idea.description,
    },
    null,
    2
  )}`;

  try {
    return await generateJson({ prompt, schema: ideaAnalysisSchema });
  } catch (_error) {
    return buildFallbackAnalysis(idea);
  }
}

module.exports = {
  ideaAnalyzer,
};
