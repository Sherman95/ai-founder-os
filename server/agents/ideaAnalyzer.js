const fs = require("fs");
const path = require("path");

const { generateJson } = require("../services/geminiService");
const { ideaAnalysisSchema } = require("../schemas/ideaAnalysis.schema");

const promptPath = path.resolve(__dirname, "../../prompts/ideaAnalyzer.md");

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

  return generateJson({ prompt, schema: ideaAnalysisSchema });
}

module.exports = {
  ideaAnalyzer,
};
