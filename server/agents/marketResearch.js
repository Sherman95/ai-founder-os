const { competitorListSchema } = require("../schemas/competitor.schema");

async function marketResearch(analysis) {
  const sample = [
    {
      name: `${analysis.industry} Incumbent Suite`,
      pricing: "estimate: $49-$299/mo",
      strengths: ["brand recognition", "large distribution"],
      weaknesses: ["slower feature iteration", "legacy UX"],
      notes: "estimate",
    },
    {
      name: `${analysis.industry} Niche Challenger`,
      pricing: "unknown",
      strengths: ["focused use case", "better onboarding"],
      weaknesses: ["limited integrations", "small team"],
      notes: "unknown",
    },
  ];

  return competitorListSchema.parse(sample);
}

module.exports = {
  marketResearch,
};
