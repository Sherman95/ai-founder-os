const { z } = require("zod");

const roadmapItemSchema = z.object({
  feature: z.string().min(1),
  priority: z.enum(["High", "Medium", "Low"]),
  complexity: z.enum(["High", "Medium", "Low"]),
  status: z.literal("Planned").default("Planned"),
});

const roadmapListSchema = z.array(roadmapItemSchema).max(30);

module.exports = {
  roadmapItemSchema,
  roadmapListSchema,
};
