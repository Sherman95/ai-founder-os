const pino = require("pino");

const env = require("../config/env");
const { buildSearchQueries } = require("./searchQueryBuilder");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

async function tavilySearch(query, maxResults) {
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: env.TAVILY_API_KEY,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
      include_images: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Tavily HTTP ${response.status}: ${text.slice(0, 400)}`);
  }

  const json = await response.json();
  return (json.results || []).map((item) => ({
    title: item.title || "",
    url: item.url || "",
    snippet: item.content || "",
    domain: getDomain(item.url || ""),
  }));
}

async function searchMarketWeb({ title, description, analysis }) {
  if (!env.WEB_SEARCH_ENABLED) {
    return [];
  }

  if (!env.TAVILY_API_KEY) {
    logger.warn({ ts: new Date().toISOString() }, "WEB_SEARCH_ENABLED but TAVILY_API_KEY missing; using fallback");
    return [];
  }

  const queries = await buildSearchQueries({ title, description, analysis });
  if (!queries.length) {
    return [];
  }

  const maxResults = Math.min(Math.max(Number(env.WEB_SEARCH_MAX_RESULTS) || 5, 1), 10);
  const settled = await Promise.allSettled(queries.map((q) => tavilySearch(q, maxResults)));

  const rows = [];
  for (let i = 0; i < settled.length; i += 1) {
    const result = settled[i];
    if (result.status !== "fulfilled") {
      logger.warn(
        { ts: new Date().toISOString(), query: queries[i], err: result.reason?.message },
        "Web search query failed"
      );
      continue;
    }

    for (const item of result.value) {
      rows.push({ ...item, query: queries[i] });
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const item of rows) {
    const key = `${item.url}|${item.title}`.toLowerCase();
    if (!item.url || seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }

  return deduped.slice(0, maxResults * 3);
}

module.exports = {
  searchMarketWeb,
};
