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
  PORT: z.coerce.number().int().positive().default(3000),
  NOTION_TOKEN: nonPlaceholderSecret("NOTION_TOKEN"),
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
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const message = parsedEnv.error.issues
    .map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment variables: ${message}`);
}

module.exports = parsedEnv.data;
