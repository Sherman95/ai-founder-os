const { roadmapListSchema } = require("../schemas/roadmap.schema");

async function productPlanner(analysis) {
  const items = [
    {
      feature: `Core ${analysis.coreValue} MVP`,
      priority: "High",
      complexity: "Medium",
      status: "Planned",
    },
    {
      feature: "Analytics and feedback loop",
      priority: "Medium",
      complexity: "Medium",
      status: "Planned",
    },
    {
      feature: "Integrations and workflow automation",
      priority: "Low",
      complexity: "High",
      status: "Planned",
    },
  ];

  return roadmapListSchema.parse(items);
}

module.exports = {
  productPlanner,
};
