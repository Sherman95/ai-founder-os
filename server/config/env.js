const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  NOTION_TOKEN: z.string().min(1, "NOTION_TOKEN is required"),
  NOTION_STARTUP_IDEAS_DB_ID: z.string().min(1, "NOTION_STARTUP_IDEAS_DB_ID is required"),
  NOTION_COMPETITORS_DB_ID: z.string().min(1, "NOTION_COMPETITORS_DB_ID is required"),
  NOTION_ROADMAP_DB_ID: z.string().min(1, "NOTION_ROADMAP_DB_ID is required"),
  NOTION_MARKETING_DB_ID: z.string().min(1, "NOTION_MARKETING_DB_ID is required"),
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY is required"),
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
