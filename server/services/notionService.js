const pino = require("pino");
const { Client } = require("@notionhq/client");

const env = require("../config/env");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const notion = new Client({ auth: env.NOTION_TOKEN });

const dbTitleCache = new Map();
const dataSourceCache = new Map();

function asRichText(value) {
  return {
    rich_text: [
      {
        type: "text",
        text: { content: String(value).slice(0, 2000) },
      },
    ],
  };
}

function asTitle(value) {
  return {
    title: [
      {
        type: "text",
        text: { content: String(value).slice(0, 200) },
      },
    ],
  };
}

function sanitizeKeyPart(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_:]/g, "")
    .slice(0, 80);
}

function buildKey(ideaPageId, type, name) {
  return `${ideaPageId}:${type}:${sanitizeKeyPart(name)}`;
}

function getStatusValue(page) {
  const properties = page.properties || {};
  for (const key of Object.keys(properties)) {
    if (properties[key]?.type === "status") {
      return properties[key]?.status?.name || null;
    }
  }
  return null;
}

function getTitleValue(page) {
  const properties = page.properties || {};
  for (const key of Object.keys(properties)) {
    if (properties[key]?.type === "title") {
      return properties[key]?.title?.[0]?.plain_text || "Untitled startup idea";
    }
  }
  return "Untitled startup idea";
}

function getDescriptionValue(page) {
  const properties = page.properties || {};
  const preferred = properties.Description;
  if (preferred?.type === "rich_text") {
    return preferred.rich_text.map((r) => r.plain_text).join(" ").trim();
  }

  for (const key of Object.keys(properties)) {
    if (properties[key]?.type === "rich_text") {
      return (properties[key].rich_text || []).map((r) => r.plain_text).join(" ").trim();
    }
  }

  return "";
}

async function getTitlePropertyName(databaseId) {
  if (dbTitleCache.has(databaseId)) {
    return dbTitleCache.get(databaseId);
  }

  const db = await notion.databases.retrieve({ database_id: databaseId });
  const titlePropName = Object.keys(db.properties).find((name) => db.properties[name].type === "title");

  if (!titlePropName) {
    throw new Error(`No title property found in database ${databaseId}`);
  }

  dbTitleCache.set(databaseId, titlePropName);
  return titlePropName;
}

async function resolveDataSourceId(databaseId) {
  if (dataSourceCache.has(databaseId)) {
    return dataSourceCache.get(databaseId);
  }

  const db = await notion.databases.retrieve({ database_id: databaseId });
  const dataSourceId = db?.data_sources?.[0]?.id || databaseId;
  dataSourceCache.set(databaseId, dataSourceId);
  return dataSourceId;
}

async function queryCollection(databaseId, payload) {
  if (typeof notion.databases?.query === "function") {
    return notion.databases.query({ database_id: databaseId, ...payload });
  }

  if (typeof notion.dataSources?.query === "function") {
    const dataSourceId = await resolveDataSourceId(databaseId);
    return notion.dataSources.query({ data_source_id: dataSourceId, ...payload });
  }

  throw new Error("Unsupported Notion SDK: no query method found");
}

async function createPageInCollection(databaseId, properties) {
  if (typeof notion.pages?.create !== "function") {
    throw new Error("Unsupported Notion SDK: pages.create is unavailable");
  }

  if (typeof notion.databases?.query === "function") {
    return notion.pages.create({
      parent: { database_id: databaseId },
      properties,
    });
  }

  const dataSourceId = await resolveDataSourceId(databaseId);
  return notion.pages.create({
    parent: { data_source_id: dataSourceId },
    properties,
  });
}

async function findByKey(databaseId, key) {
  const result = await queryCollection(databaseId, {
    filter: {
      property: "Key",
      rich_text: {
        equals: key,
      },
    },
    page_size: 1,
  });

  return result.results[0] || null;
}

async function queryStartupIdeasToRun() {
  try {
    const result = await queryCollection(env.NOTION_STARTUP_IDEAS_DB_ID, {
      filter: {
        or: [
          {
            property: "Status",
            status: {
              equals: "Run",
            },
          },
          {
            property: "Status",
            status: {
              equals: "Queued",
            },
          },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
    });

    const ideas = result.results.map((page) => ({
      id: page.id,
      title: getTitleValue(page),
      description: getDescriptionValue(page),
      status: getStatusValue(page),
      rawPage: page,
    }));

    logger.info({ ts: new Date().toISOString(), count: ideas.length }, "Queried startup ideas to run");
    return ideas;
  } catch (error) {
    logger.error({ ts: new Date().toISOString(), err: error?.message }, "Failed querying startup ideas");
    throw error;
  }
}

async function updateIdeaStatus(pageId, status, extraProps = {}) {
  try {
    const properties = {
      Status: { status: { name: status } },
    };

    if (typeof extraProps.score === "number") {
      properties["Startup Viability Score"] = { number: extraProps.score };
    }

    if (extraProps.summary) {
      properties["Executive Summary"] = asRichText(extraProps.summary);
    }

    if (extraProps.runLog) {
      properties["Run Log"] = asRichText(extraProps.runLog);
    }

    await notion.pages.update({
      page_id: pageId,
      properties,
    });

    logger.info({ ts: new Date().toISOString(), pageId, status }, "Updated startup idea status");
  } catch (error) {
    logger.error({ ts: new Date().toISOString(), pageId, status, err: error?.message }, "Failed updating idea status");
    throw error;
  }
}

async function upsertOutputItem(databaseId, ideaPageId, type, name, fieldMap) {
  const key = buildKey(ideaPageId, type, name);
  const titleProperty = await getTitlePropertyName(databaseId);
  const existing = await findByKey(databaseId, key);

  const properties = {
    [titleProperty]: asTitle(name),
    Key: asRichText(key),
    "Source Idea": asRichText(ideaPageId),
    ...fieldMap,
  };

  if (existing) {
    await notion.pages.update({ page_id: existing.id, properties });
    return existing.id;
  }

  const created = await createPageInCollection(databaseId, properties);

  return created.id;
}

async function createOrUpsertCompetitors(ideaPageId, competitors) {
  for (const competitor of competitors) {
    const fieldMap = {
      Pricing: asRichText(competitor.pricing || "unknown"),
      Strengths: asRichText((competitor.strengths || []).join(", ") || "unknown"),
      Weaknesses: asRichText((competitor.weaknesses || []).join(", ") || "unknown"),
      Notes: asRichText(competitor.notes || "estimate"),
    };

    await upsertOutputItem(
      env.NOTION_COMPETITORS_DB_ID,
      ideaPageId,
      "competitor",
      competitor.name,
      fieldMap
    );
  }

  logger.info({ ts: new Date().toISOString(), ideaPageId, count: competitors.length }, "Upserted competitors");
}

async function createOrUpsertRoadmap(ideaPageId, roadmapItems) {
  for (const item of roadmapItems) {
    const fieldMap = {
      Priority: asRichText(item.priority),
      Complexity: asRichText(item.complexity),
      Status: asRichText(item.status || "Planned"),
    };

    await upsertOutputItem(env.NOTION_ROADMAP_DB_ID, ideaPageId, "roadmap", item.feature, fieldMap);
  }

  logger.info({ ts: new Date().toISOString(), ideaPageId, count: roadmapItems.length }, "Upserted roadmap items");
}

async function createOrUpsertMarketing(ideaPageId, marketingItems) {
  for (const item of marketingItems) {
    const name = `${item.channel} - ${item.strategy}`;
    const fieldMap = {
      Channel: asRichText(item.channel),
      Strategy: asRichText(item.strategy),
      "Content Idea": asRichText(item.contentIdea),
      Priority: asRichText(item.priority),
    };

    await upsertOutputItem(env.NOTION_MARKETING_DB_ID, ideaPageId, "marketing", name, fieldMap);
  }

  logger.info({ ts: new Date().toISOString(), ideaPageId, count: marketingItems.length }, "Upserted marketing items");
}

module.exports = {
  queryStartupIdeasToRun,
  updateIdeaStatus,
  createOrUpsertCompetitors,
  createOrUpsertRoadmap,
  createOrUpsertMarketing,
};
