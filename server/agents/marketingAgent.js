const { marketingListSchema } = require("../schemas/marketing.schema");

async function marketingAgent(analysis) {
  const items = [
    {
      channel: "LinkedIn",
      strategy: `Founder-led thought leadership in ${analysis.industry}`,
      contentIdea: "Weekly teardown of customer pain points and wins",
      priority: "High",
    },
    {
      channel: "SEO",
      strategy: `Problem-solution landing pages for ${analysis.targetUsers}`,
      contentIdea: "Comparison pages vs alternatives with ROI calculators",
      priority: "Medium",
    },
    {
      channel: "Email",
      strategy: "Lifecycle nurture based on user intent",
      contentIdea: "3-email educational sequence with CTA to demo",
      priority: "Medium",
    },
  ];

  return marketingListSchema.parse(items);
}

module.exports = {
  marketingAgent,
};
