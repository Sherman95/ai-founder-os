const { z } = require("zod");

const marketingItemSchema = z.object({
  channel: z.string().min(1),
  strategy: z.string().min(1),
  contentIdea: z.string().min(1),
  priority: z.enum(["High", "Medium", "Low"]),
});

const marketingListSchema = z.array(marketingItemSchema).max(30);

module.exports = {
  marketingItemSchema,
  marketingListSchema,
};
