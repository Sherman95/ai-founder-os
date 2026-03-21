const pino = require("pino");
const { GoogleGenAI } = require("@google/genai");

const env = require("../config/env");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

function stripCodeFences(value) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

function isQuotaError(error) {
  const text = String(error?.message || "");
  return (
    text.includes("429") ||
    text.toLowerCase().includes("resource_exhausted") ||
    text.toLowerCase().includes("quota")
  );
}

function getValidationErrorSummary(error) {
  if (!error?.issues) {
    return String(error?.message || "Unknown schema validation error");
  }

  return error.issues
    .slice(0, 10)
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

function buildInitialPrompt(prompt) {
  return `${prompt}\n\nReturn ONLY strict valid JSON. Do not include markdown, code fences, or commentary.`;
}

function buildRepairPrompt({ originalPrompt, invalidOutput, errorMessage }) {
  return [
    "You are a JSON repair assistant.",
    "Fix the output so it matches the original task exactly.",
    "Return ONLY valid JSON with no markdown fences and no extra text.",
    "",
    "ORIGINAL TASK:",
    originalPrompt,
    "",
    "PREVIOUS INVALID OUTPUT:",
    invalidOutput,
    "",
    "ERROR TO FIX:",
    errorMessage,
  ].join("\n");
}

async function requestJsonText({ prompt, model }) {
  const response = await client.models.generateContent({
    model,
    contents: prompt,
    config: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });

  if (typeof response.text === "string") {
    return response.text;
  }
  if (typeof response.text === "function") {
    return response.text();
  }

  return (
    response?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("") || ""
  );
}

async function generateJson({ prompt, schema, model = "gemini-2.0-flash" }) {
  const maxRepairs = 2;
  let rawOutput = "";
  let currentPrompt = buildInitialPrompt(prompt);
  let lastError = null;

  for (let attempt = 0; attempt <= maxRepairs; attempt += 1) {
    try {
      rawOutput = await requestJsonText({ prompt: currentPrompt, model });
      const parsed = JSON.parse(stripCodeFences(rawOutput));
      return schema.parse(parsed);
    } catch (error) {
      lastError = error;

      logger.warn(
        {
          ts: new Date().toISOString(),
          attempt: attempt + 1,
          promptPreview: prompt.slice(0, 400),
          err: error?.message,
        },
        "Gemini JSON generation failed"
      );

      if (isQuotaError(error)) {
        break;
      }

      if (attempt >= maxRepairs) {
        break;
      }

      const errorMessage = error?.issues ? getValidationErrorSummary(error) : String(error?.message || error);
      currentPrompt = buildRepairPrompt({
        originalPrompt: prompt,
        invalidOutput: rawOutput,
        errorMessage,
      });
    }
  }

  logger.error(
    { ts: new Date().toISOString(), err: lastError?.message, outputPreview: String(rawOutput).slice(0, 500) },
    "Gemini retries exhausted"
  );
  throw new Error(`Gemini failed to generate valid JSON: ${lastError?.message}`);
}

module.exports = {
  generateJson,
  isQuotaError,
};
