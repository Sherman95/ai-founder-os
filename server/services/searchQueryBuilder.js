const { z } = require("zod");

const { generateJson } = require("./geminiService");

const keywordSchema = z.object({
  keywords: z.array(z.string().min(2)).min(2).max(8),
});

function tokenizeFallback(text) {
  const stop = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "your",
    "idea",
    "startup",
    "para",
    "con",
    "una",
    "que",
    "los",
    "las",
    "por",
    "del",
    "de",
    "la",
    "el",
  ]);

  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/gi, " ")
    .split(/\s+/)
    .map((v) => v.trim())
    .filter((v) => v.length >= 3 && !stop.has(v));

  return Array.from(new Set(tokens)).slice(0, 6);
}

function looksLikeSaas(text) {
  const sample = String(text || "").toLowerCase();
  return ["saas", "software", "subscription", "api", "platform", "b2b"].some((v) => sample.includes(v));
}

async function extractKeywords({ title, description }) {
  const source = `${title || ""} ${description || ""}`.trim();
  if (!source) {
    return ["startup software"];
  }

  const prompt = [
    "Extract 3 to 6 search keywords from this startup idea.",
    "Return strict JSON: { \"keywords\": [\"...\"] }",
    "Keep keywords concise and market-specific.",
    "",
    "IDEA:",
    source,
  ].join("\n");

  try {
    const parsed = await generateJson({ prompt, schema: keywordSchema });
    const cleaned = parsed.keywords.map((v) => v.trim()).filter(Boolean);
    return cleaned.length ? cleaned : tokenizeFallback(source);
  } catch {
    return tokenizeFallback(source);
  }
}

async function buildSearchQueries({ title, description, analysis }) {
  const keywords = await extractKeywords({ title, description });
  const base = keywords.slice(0, 4).join(" ") || analysis?.industry || title || "startup software";

  const queries = [
    `${base} competitors alternatives`,
    `${base} market players ${new Date().getFullYear()}`,
  ];

  if (looksLikeSaas(`${title || ""} ${description || ""} ${analysis?.monetization || ""}`)) {
    queries.push(`${base} saas pricing comparison`);
  }

  return Array.from(new Set(queries)).slice(0, 3);
}

module.exports = {
  buildSearchQueries,
};
