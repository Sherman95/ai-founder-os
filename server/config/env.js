const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const notionDbIdSchema = z
  .string()
  .regex(/^[a-f0-9]{32}$/i, "must be a 32-char Notion database ID (no dashes)");

const nonPlaceholderSecret = (label) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine(
      (value) => !["secret_notion_token", "your_gemini_api_key", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"].includes(value),
      `${label} must be replaced with a real value`
    );

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  NOTION_MODE: z.enum(["api", "mcp"]).default("api"),
  PORT: z.coerce.number().int().positive().default(3000),
  MCP_PORT: z.coerce.number().int().positive().default(7337),
  NOTION_TOKEN: z.string().optional(),
  NOTION_OAUTH_CLIENT_ID: z.string().optional(),
  NOTION_OAUTH_CLIENT_SECRET: z.string().optional(),
  NOTION_OAUTH_REDIRECT_URI: z.string().optional(),
  NOTION_OAUTH_TOKEN: z.string().optional(),
  NOTION_MCP_ENDPOINT: z.string().url().default("https://mcp.notion.com/mcp"),
  NOTION_MCP_TOOL_QUERY_STARTUP_IDEAS: z.string().optional(),
  NOTION_MCP_TOOL_GET_IDEA: z.string().optional(),
  NOTION_MCP_TOOL_UPDATE_IDEA_STATUS: z.string().optional(),
  NOTION_MCP_TOOL_CLAIM_IDEA: z.string().optional(),
  NOTION_MCP_TOOL_UPSERT_COMPETITORS: z.string().optional(),
  NOTION_MCP_TOOL_UPSERT_ROADMAP: z.string().optional(),
  NOTION_MCP_TOOL_UPSERT_MARKETING: z.string().optional(),
  NOTION_MCP_TOOL_VALIDATE_SCHEMAS: z.string().optional(),
  NOTION_MCP_TOOL_OUTPUT_COUNTS: z.string().optional(),
  NOTION_MCP_TOOL_LIST_REVIEW_ITEMS: z.string().optional(),
  NOTION_MCP_TOOL_UPDATE_OUTPUT_ITEM: z.string().optional(),
  NOTION_STARTUP_IDEAS_DB_ID: notionDbIdSchema.refine(
    (value) => value !== "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "NOTION_STARTUP_IDEAS_DB_ID must be replaced with a real value"
  ),
  NOTION_COMPETITORS_DB_ID: notionDbIdSchema.refine(
    (value) => value !== "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "NOTION_COMPETITORS_DB_ID must be replaced with a real value"
  ),
  NOTION_ROADMAP_DB_ID: notionDbIdSchema.refine(
    (value) => value !== "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "NOTION_ROADMAP_DB_ID must be replaced with a real value"
  ),
  NOTION_MARKETING_DB_ID: notionDbIdSchema.refine(
    (value) => value !== "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "NOTION_MARKETING_DB_ID must be replaced with a real value"
  ),
  GEMINI_API_KEY: nonPlaceholderSecret("GEMINI_API_KEY"),
  POLL_INTERVAL_MS: z.coerce.number().int().min(30000).max(120000).default(45000),
  DISABLE_POLLER: z
    .enum(["true", "false", "1", "0", "TRUE", "FALSE"])
    .optional()
    .transform((value) => ["true", "1", "TRUE"].includes(value || "")),
  MAX_COMPETITORS: z.coerce.number().int().min(1).max(20).default(5),
  MAX_ROADMAP_ITEMS: z.coerce.number().int().min(1).max(30).default(7),
  MAX_MARKETING_ITEMS: z.coerce.number().int().min(1).max(30).default(7),
})
  .superRefine((data, ctx) => {
    if (data.NOTION_MODE === "api") {
      const parsed = nonPlaceholderSecret("NOTION_TOKEN").safeParse(data.NOTION_TOKEN);
      if (!parsed.success) {
        ctx.addIssue({ code: "custom", path: ["NOTION_TOKEN"], message: "NOTION_TOKEN is required in api mode" });
      }
      return;
    }

    const oauthFields = [
      "NOTION_OAUTH_CLIENT_ID",
      "NOTION_OAUTH_CLIENT_SECRET",
      "NOTION_OAUTH_REDIRECT_URI",
      "NOTION_OAUTH_TOKEN",
    ];

    for (const field of oauthFields) {
      if (!data[field]) {
        ctx.addIssue({ code: "custom", path: [field], message: `${field} is required in mcp mode` });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const message = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment variables: ${message}`);
}

module.exports = parsedEnv.data;
