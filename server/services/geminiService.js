const pino = require("pino");
const { GoogleGenAI } = require("@google/genai");

const env = require("../config/env");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

function stripCodeFences(value) {
  return value.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function generateJson({ prompt, schema, model = "gemini-2.0-flash" }) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: prompt,
        config: {
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      });

      let rawText = "";
      if (typeof response.text === "string") {
        rawText = response.text;
      } else if (typeof response.text === "function") {
        rawText = response.text();
      } else {
        rawText =
          response?.candidates?.[0]?.content?.parts
            ?.map((part) => part.text || "")
            .join("") || "";
      }

      const jsonText = stripCodeFences(rawText);
      const parsed = JSON.parse(jsonText);
      return schema.parse(parsed);
    } catch (error) {
      lastError = error;
      logger.warn(
        {
          ts: new Date().toISOString(),
          attempt,
          promptPreview: prompt.slice(0, 400),
          err: error?.message,
        },
        "Gemini JSON generation failed"
      );
    }
  }

  logger.error({ ts: new Date().toISOString(), err: lastError?.message }, "Gemini retries exhausted");
  throw new Error(`Gemini failed to generate valid JSON: ${lastError?.message}`);
}

module.exports = {
  generateJson,
};
