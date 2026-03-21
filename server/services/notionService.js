const pino = require("pino");
const { Client } = require("@notionhq/client");
const crypto = require("crypto");

const env = require("../config/env");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const notion = new Client({ auth: env.NOTION_TOKEN || env.NOTION_OAUTH_TOKEN });

const dbTitleCache = new Map();
const dataSourceCache = new Map();
const statusPropertyCache = new Map();
const collectionPropertiesCache = new Map();

const NEEDS_REVIEW_ALIASES = ["Needs Review", "Review", "NeedsReview", "Revisar", "Needs review"];
const CORRECTION_NOTES_ALIASES = [
  "Correction Notes",
  "Corrections",
  "Notes",
  "Correction",
  "Notas",
  "Notas de corrección",
];

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

function normalizePropertyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findPropertyMeta(properties, candidateNames, allowedTypes = null) {
  const normalizedCandidates = (candidateNames || []).map(normalizePropertyName);
  const entries = Object.entries(properties || {});

  for (const [name, def] of entries) {
    const isNameMatch = normalizedCandidates.includes(normalizePropertyName(name));
    const isTypeMatch = !allowedTypes || allowedTypes.includes(def.type);
    if (isNameMatch && isTypeMatch) {
      return { name, def };
    }
  }

  return null;
}

function buildFilterByType(propertyName, propertyType, value) {
  if (propertyType === "title") {
    return { property: propertyName, title: { equals: String(value).slice(0, 200) } };
  }
  if (propertyType === "rich_text") {
    return { property: propertyName, rich_text: { equals: String(value).slice(0, 2000) } };
  }
  if (propertyType === "select") {
    return { property: propertyName, select: { equals: String(value) } };
  }
  if (propertyType === "multi_select") {
    return { property: propertyName, multi_select: { contains: String(value) } };
  }

  return null;
}

function toNotionPropertyValue(def, value) {
  if (value === undefined || value === null) {
    return null;
  }

  if (def.type === "title") {
    return asTitle(value);
  }

  if (def.type === "rich_text") {
    return asRichText(value);
  }

  if (def.type === "number") {
    const num = Number(value);
    return Number.isFinite(num) ? { number: num } : null;
  }

  if (def.type === "checkbox") {
    return { checkbox: Boolean(value) };
  }

  if (def.type === "select") {
    const selectValue = String(value).trim();
    if (!selectValue) {
      return null;
    }

    const options = def.select?.options || [];
    if (options.length && !options.some((o) => o.name === selectValue)) {
      return null;
    }
    return { select: { name: selectValue } };
  }

  if (def.type === "multi_select") {
    const values = Array.isArray(value) ? value : [value];
    const names = values.map((v) => String(v).trim()).filter(Boolean);
    if (!names.length) {
      return null;
    }

    const options = def.multi_select?.options || [];
    const allowed =
      options.length > 0 ? names.filter((name) => options.some((o) => o.name === name)) : names;
    if (!allowed.length) {
      return null;
    }
    return { multi_select: allowed.map((name) => ({ name })) };
  }

  if (def.type === "date") {
    return { date: { start: String(value) } };
  }

  return null;
}

function getStatusValue(page) {
  const properties = page.properties || {};
  for (const key of Object.keys(properties)) {
    if (properties[key]?.type === "status") {
      return properties[key]?.status?.name || null;
    }
    if (properties[key]?.type === "select") {
      return properties[key]?.select?.name || null;
    }
    if (properties[key]?.type === "multi_select") {
      return properties[key]?.multi_select?.[0]?.name || null;
    }
  }
  return null;
}

function getStatusValueFromProperty(property) {
  if (!property) {
    return null;
  }

  if (property.type === "status") {
    return property.status?.name || null;
  }
  if (property.type === "select") {
    return property.select?.name || null;
  }
  if (property.type === "multi_select") {
    return property.multi_select?.[0]?.name || null;
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

function findFirstExistingPropertyName(properties, candidates) {
  return candidates.find((name) => Object.prototype.hasOwnProperty.call(properties, name)) || null;
}

function extractPlainTextByProperty(property) {
  if (!property) {
    return "";
  }

  if (property.type === "title") {
    return (property.title || []).map((v) => v.plain_text || "").join(" ").trim();
  }

  if (property.type === "rich_text") {
    return (property.rich_text || []).map((v) => v.plain_text || "").join(" ").trim();
  }

  if (property.type === "select") {
    return property.select?.name || "";
  }

  if (property.type === "multi_select") {
    return (property.multi_select || []).map((v) => v.name).filter(Boolean).join(", ");
  }

  if (property.type === "status") {
    return property.status?.name || "";
  }

  if (property.type === "checkbox") {
    return property.checkbox ? "true" : "false";
  }

  if (property.type === "number") {
    return Number.isFinite(property.number) ? String(property.number) : "";
  }

  return "";
}

function extractCheckboxByProperty(property) {
  if (!property) {
    return false;
  }

  if (property.type === "checkbox") {
    return Boolean(property.checkbox);
  }

  if (property.type === "select") {
    return String(property.select?.name || "").toLowerCase() === "true";
  }

  if (property.type === "multi_select") {
    return (property.multi_select || []).some((v) => String(v.name || "").toLowerCase() === "true");
  }

  return false;
}

function parseListValue(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function coerceEnumValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function getOutputDatabaseIdByType(type) {
  if (type === "competitor") {
    return env.NOTION_COMPETITORS_DB_ID;
  }
  if (type === "roadmap") {
    return env.NOTION_ROADMAP_DB_ID;
  }
  if (type === "marketing") {
    return env.NOTION_MARKETING_DB_ID;
  }
  throw new Error(`Unsupported review type: ${type}`);
}

function buildFieldMapForType(type, item) {
  if (type === "competitor") {
    return [
      { aliases: ["Pricing"], value: item.pricing || "unknown" },
      { aliases: ["Strengths"], value: (item.strengths || []).join(", ") || "unknown" },
      { aliases: ["Weaknesses"], value: (item.weaknesses || []).join(", ") || "unknown" },
      { aliases: ["Notes"], value: item.notes || "" },
      { aliases: ["Market"], value: item.market || "" },
      { aliases: ["Website"], value: item.website || "" },
    ];
  }

  if (type === "roadmap") {
    return [
      {
        aliases: ["Priority"],
        value: item.priority,
        allowedTypes: ["select", "multi_select", "rich_text"],
      },
      {
        aliases: ["Status"],
        value: item.status || "Planned",
        allowedTypes: ["select", "multi_select", "status", "rich_text"],
      },
      {
        aliases: ["Complexity"],
        value: item.complexity,
        allowedTypes: ["select", "multi_select", "rich_text"],
      },
      {
        aliases: ["Description"],
        value: `Complexity: ${item.complexity || "Medium"}`,
        allowedTypes: ["rich_text"],
      },
    ];
  }

  if (type === "marketing") {
    return [
      { aliases: ["Channel"], value: item.channel },
      { aliases: ["Strategy"], value: item.strategy },
      { aliases: ["Content Idea", "Campaign Idea"], value: item.contentIdea },
      {
        aliases: ["Priority"],
        value: item.priority,
        allowedTypes: ["select", "multi_select", "rich_text"],
      },
      {
        aliases: ["Seleccionar"],
        value: item.contentIdea,
        allowedTypes: ["select", "multi_select"],
      },
    ];
  }

  throw new Error(`Unsupported field-map type: ${type}`);
}

async function getTitlePropertyName(databaseId) {
  if (dbTitleCache.has(databaseId)) {
    return dbTitleCache.get(databaseId);
  }

  const properties = await getCollectionProperties(databaseId);
  const titlePropName = Object.keys(properties).find((name) => properties[name].type === "title");

  if (!titlePropName) {
    throw new Error(`No title property found in database ${databaseId}`);
  }

  dbTitleCache.set(databaseId, titlePropName);
  return titlePropName;
}

async function getDatabaseProperties(databaseId) {
  const db = await notion.databases.retrieve({ database_id: databaseId });
  return db.properties || {};
}

async function getCollectionProperties(databaseId) {
  if (collectionPropertiesCache.has(databaseId)) {
    return collectionPropertiesCache.get(databaseId);
  }

  const dbProps = await getDatabaseProperties(databaseId);
  if (Object.keys(dbProps).length > 0) {
    collectionPropertiesCache.set(databaseId, dbProps);
    return dbProps;
  }

  if (typeof notion.dataSources?.retrieve === "function") {
    const dataSourceId = await resolveDataSourceId(databaseId);
    const ds = await notion.dataSources.retrieve({ data_source_id: dataSourceId });
    const dsProps = ds.properties || {};
    collectionPropertiesCache.set(databaseId, dsProps);
    return dsProps;
  }

  collectionPropertiesCache.set(databaseId, dbProps);
  return dbProps;
}

async function getStatusPropertyMeta(databaseId) {
  if (statusPropertyCache.has(databaseId)) {
    return statusPropertyCache.get(databaseId);
  }

  const properties = await getCollectionProperties(databaseId);
  const statusTypes = new Set(["status", "select", "multi_select"]);

  const explicitStatus = properties.Status;
  if (explicitStatus && statusTypes.has(explicitStatus.type)) {
    const meta = { name: "Status", type: explicitStatus.type };
    statusPropertyCache.set(databaseId, meta);
    return meta;
  }

  const byName = Object.entries(properties).find(([name, def]) => {
    const normalized = name.toLowerCase();
    return (normalized.includes("status") || normalized.includes("estado")) && statusTypes.has(def.type);
  });

  if (byName) {
    const meta = { name: byName[0], type: byName[1].type };
    statusPropertyCache.set(databaseId, meta);
    return meta;
  }

  const byType = Object.entries(properties).find(([, def]) => statusTypes.has(def.type));
  if (byType) {
    const meta = { name: byType[0], type: byType[1].type };
    statusPropertyCache.set(databaseId, meta);
    return meta;
  }

  throw new Error(`No status/select/multi_select workflow property found in database ${databaseId}`);
}

function buildStatusFilter(propertyName, propertyType, value) {
  if (propertyType === "status") {
    return { property: propertyName, status: { equals: value } };
  }
  if (propertyType === "select") {
    return { property: propertyName, select: { equals: value } };
  }
  if (propertyType === "multi_select") {
    return { property: propertyName, multi_select: { contains: value } };
  }
  throw new Error(`Unsupported status property type: ${propertyType}`);
}

function buildStatusUpdateProperty(propertyType, value) {
  if (propertyType === "status") {
    return { status: { name: value } };
  }
  if (propertyType === "select") {
    return { select: { name: value } };
  }
  if (propertyType === "multi_select") {
    return { multi_select: [{ name: value }] };
  }
  throw new Error(`Unsupported status property type: ${propertyType}`);
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
  const props = await getCollectionProperties(databaseId);
  const keyMeta = findPropertyMeta(props, ["Key"], ["rich_text", "title"]);
  if (!keyMeta) {
    return null;
  }

  const keyFilter = buildFilterByType(keyMeta.name, keyMeta.def.type, key);
  if (!keyFilter) {
    return null;
  }

  const result = await queryCollection(databaseId, {
    filter: keyFilter,
    page_size: 1,
  });

  return result.results[0] || null;
}

async function findBySourceAndTitle(databaseId, sourceMeta, ideaPageId, titleMeta, name) {
  if (!sourceMeta || !titleMeta) {
    return null;
  }

  const sourceFilter = buildFilterByType(sourceMeta.name, sourceMeta.def.type, ideaPageId);
  const titleFilter = buildFilterByType(titleMeta.name, titleMeta.def.type, name);
  if (!sourceFilter || !titleFilter) {
    return null;
  }

  const result = await queryCollection(databaseId, {
    filter: {
      and: [sourceFilter, titleFilter],
    },
    page_size: 1,
  });

  return result.results[0] || null;
}

async function queryStartupIdeasToRun() {
  try {
    const statusMeta = await getStatusPropertyMeta(env.NOTION_STARTUP_IDEAS_DB_ID);
    const result = await queryCollection(env.NOTION_STARTUP_IDEAS_DB_ID, {
      filter: {
        or: [
          buildStatusFilter(statusMeta.name, statusMeta.type, "Run"),
          buildStatusFilter(statusMeta.name, statusMeta.type, "Queued"),
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

async function getIdeaById(pageId) {
  const page = await notion.pages.retrieve({ page_id: pageId });
  return {
    id: page.id,
    title: getTitleValue(page),
    description: getDescriptionValue(page),
    status: getStatusValue(page),
    rawPage: page,
  };
}

async function updateIdeaStatus(pageId, status, extraProps = {}) {
  try {
    const statusMeta = await getStatusPropertyMeta(env.NOTION_STARTUP_IDEAS_DB_ID);
    const startupProps = await getCollectionProperties(env.NOTION_STARTUP_IDEAS_DB_ID);
    const properties = {
      [statusMeta.name]: buildStatusUpdateProperty(statusMeta.type, status),
    };

    if (typeof extraProps.score === "number") {
      const scoreName = findFirstExistingPropertyName(startupProps, [
        "Startup Viability Score",
        "Viability Score",
        "Score",
      ]);
      if (scoreName) {
        const scoreType = startupProps[scoreName]?.type;
        if (scoreType === "number") {
          properties[scoreName] = { number: extraProps.score };
        } else if (scoreType === "rich_text") {
          properties[scoreName] = asRichText(extraProps.score);
        }
      }
    }

    if (extraProps.summary) {
      const summaryName = findFirstExistingPropertyName(startupProps, ["Executive Summary", "Summary"]);
      if (summaryName && startupProps[summaryName]?.type === "rich_text") {
        properties[summaryName] = asRichText(extraProps.summary);
      }
    }

    if (extraProps.runLog) {
      const runLogName = findFirstExistingPropertyName(startupProps, ["Run Log", "Logs"]);
      if (runLogName && startupProps[runLogName]?.type === "rich_text") {
        properties[runLogName] = asRichText(extraProps.runLog);
      }
    }

    if (extraProps.lastRunAt) {
      const lastRunName = findFirstExistingPropertyName(startupProps, ["Last Run"]);
      if (lastRunName) {
        const lastRunType = startupProps[lastRunName]?.type;
        if (lastRunType === "date") {
          properties[lastRunName] = { date: { start: extraProps.lastRunAt } };
        } else if (lastRunType === "rich_text") {
          properties[lastRunName] = asRichText(extraProps.lastRunAt);
        }
      }
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

async function claimIdeaForRun(pageId) {
  const statusMeta = await getStatusPropertyMeta(env.NOTION_STARTUP_IDEAS_DB_ID);
  const page = await notion.pages.retrieve({ page_id: pageId });

  const statusProperty = page.properties?.[statusMeta.name];
  const currentStatus = getStatusValueFromProperty(statusProperty);

  if (!["Run", "Queued"].includes(currentStatus || "")) {
    logger.info(
      { ts: new Date().toISOString(), pageId, currentStatus },
      "Idea not claimable, skipping workflow"
    );
    return false;
  }

  await updateIdeaStatus(pageId, "Running", {
    runLog: `Workflow claimed at ${new Date().toISOString()}`,
    lastRunAt: new Date().toISOString(),
  });

  return true;
}

function requirePropertyByType({ properties, databaseLabel, propertyName, allowedTypes }) {
  const meta = findPropertyMeta(properties, [propertyName], allowedTypes);
  if (!meta) {
    throw new Error(
      `${databaseLabel} is missing required property '${propertyName}' with type(s): ${allowedTypes.join(", ")}`
    );
  }
  return meta;
}

async function validateConfiguredSchemas() {
  const issues = [];

  const check = async (label, databaseId, validator) => {
    try {
      const props = await getCollectionProperties(databaseId);
      await validator(props);
      logger.info({ ts: new Date().toISOString(), label }, "Schema validation passed");
    } catch (error) {
      issues.push(`${label}: ${error?.message || error}`);
    }
  };

  await check("Startup Ideas", env.NOTION_STARTUP_IDEAS_DB_ID, async (properties) => {
    const titleMeta = Object.entries(properties).find(([, def]) => def.type === "title");
    if (!titleMeta) {
      throw new Error("missing required title property");
    }

    const statusMeta = await getStatusPropertyMeta(env.NOTION_STARTUP_IDEAS_DB_ID);
    if (!statusMeta) {
      throw new Error("missing workflow status property (status/select/multi_select)");
    }

    const optionalSummary = findPropertyMeta(properties, ["Executive Summary", "Summary"], ["rich_text"]);
    const optionalScore = findPropertyMeta(properties, ["Startup Viability Score", "Score"], [
      "number",
      "rich_text",
    ]);
    const optionalLog = findPropertyMeta(properties, ["Run Log", "Logs"], ["rich_text"]);

    logger.info(
      {
        ts: new Date().toISOString(),
        titleProperty: titleMeta[0],
        statusProperty: statusMeta.name,
        supportsSummary: Boolean(optionalSummary),
        supportsScore: Boolean(optionalScore),
        supportsRunLog: Boolean(optionalLog),
      },
      "Startup Ideas schema capability"
    );
  });

  await check("Competitors", env.NOTION_COMPETITORS_DB_ID, async (properties) => {
    const hasTitle = Object.entries(properties).some(([, def]) => def.type === "title");
    if (!hasTitle) {
      throw new Error("missing required title property");
    }
    requirePropertyByType({
      properties,
      databaseLabel: "Competitors",
      propertyName: "Source Idea",
      allowedTypes: ["rich_text"],
    });
  });

  await check("Roadmap", env.NOTION_ROADMAP_DB_ID, async (properties) => {
    const hasTitle = Object.entries(properties).some(([, def]) => def.type === "title");
    if (!hasTitle) {
      throw new Error("missing required title property");
    }
    requirePropertyByType({
      properties,
      databaseLabel: "Roadmap",
      propertyName: "Source Idea",
      allowedTypes: ["rich_text"],
    });
  });

  await check("Marketing", env.NOTION_MARKETING_DB_ID, async (properties) => {
    const hasTitle = Object.entries(properties).some(([, def]) => def.type === "title");
    if (!hasTitle) {
      throw new Error("missing required title property");
    }
    requirePropertyByType({
      properties,
      databaseLabel: "Marketing",
      propertyName: "Source Idea",
      allowedTypes: ["rich_text"],
    });
  });

  if (issues.length) {
    throw new Error(`Schema validation failed: ${issues.join(" | ")}`);
  }
}

function applyReviewPropertiesToPayload(collectionProps, properties, reviewState = null) {
  if (!reviewState) {
    return;
  }

  const reviewMeta = findPropertyMeta(collectionProps, NEEDS_REVIEW_ALIASES, ["checkbox"]);
  if (reviewMeta) {
    const notionValue = toNotionPropertyValue(reviewMeta.def, reviewState.needsReview === true ? true : false);
    if (notionValue) {
      properties[reviewMeta.name] = notionValue;
    }
  }

  const notesMeta = findPropertyMeta(collectionProps, CORRECTION_NOTES_ALIASES, ["rich_text", "title"]);
  if (notesMeta) {
    const notesValue = toNotionPropertyValue(notesMeta.def, reviewState.correctionNotes || "");
    if (notesValue) {
      properties[notesMeta.name] = notesValue;
    }
  }
}

async function upsertOutputItem(databaseId, ideaPageId, type, name, fieldMap, reviewState = null) {
  const key = buildKey(ideaPageId, type, name);
  const collectionProps = await getCollectionProperties(databaseId);
  const titleProperty = await getTitlePropertyName(databaseId);
  const titleMeta = { name: titleProperty, def: collectionProps[titleProperty] };
  const keyMeta = findPropertyMeta(collectionProps, ["Key"], ["rich_text", "title"]);
  const sourceMeta = findPropertyMeta(collectionProps, ["Source Idea", "Source"], [
    "rich_text",
    "title",
    "select",
    "multi_select",
  ]);

  let existing = null;
  if (keyMeta) {
    existing = await findByKey(databaseId, key);
  }
  if (!existing) {
    existing = await findBySourceAndTitle(databaseId, sourceMeta, ideaPageId, titleMeta, name);
  }

  const properties = {
    [titleProperty]: asTitle(name),
  };

  if (keyMeta) {
    const keyValue = toNotionPropertyValue(keyMeta.def, key);
    if (keyValue) {
      properties[keyMeta.name] = keyValue;
    }
  }

  if (sourceMeta) {
    const sourceValue = toNotionPropertyValue(sourceMeta.def, ideaPageId);
    if (sourceValue) {
      properties[sourceMeta.name] = sourceValue;
    }
  }

  for (const field of fieldMap) {
    const meta = findPropertyMeta(collectionProps, field.aliases, field.allowedTypes || null);
    if (!meta) {
      continue;
    }

    const notionValue = toNotionPropertyValue(meta.def, field.value);
    if (notionValue) {
      properties[meta.name] = notionValue;
    }
  }

  applyReviewPropertiesToPayload(collectionProps, properties, reviewState);

  if (existing) {
    await notion.pages.update({ page_id: existing.id, properties });
    return existing.id;
  }

  const created = await createPageInCollection(databaseId, properties);

  return created.id;
}

async function createOrUpsertCompetitors(ideaPageId, competitors) {
  for (const competitor of competitors) {
    const fieldMap = buildFieldMapForType("competitor", competitor);

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
    const fieldMap = buildFieldMapForType("roadmap", item);

    await upsertOutputItem(env.NOTION_ROADMAP_DB_ID, ideaPageId, "roadmap", item.feature, fieldMap);
  }

  logger.info({ ts: new Date().toISOString(), ideaPageId, count: roadmapItems.length }, "Upserted roadmap items");
}

async function createOrUpsertMarketing(ideaPageId, marketingItems) {
  for (const item of marketingItems) {
    const name = `${item.channel} - ${item.strategy}`;
    const fieldMap = buildFieldMapForType("marketing", item);

    await upsertOutputItem(env.NOTION_MARKETING_DB_ID, ideaPageId, "marketing", name, fieldMap);
  }

  logger.info({ ts: new Date().toISOString(), ideaPageId, count: marketingItems.length }, "Upserted marketing items");
}

async function countOutputItemsForIdea(databaseId, ideaPageId) {
  const props = await getCollectionProperties(databaseId);
  const sourceMeta = findPropertyMeta(props, ["Source Idea", "Source"], [
    "rich_text",
    "title",
    "select",
    "multi_select",
  ]);

  if (!sourceMeta) {
    return 0;
  }

  const sourceFilter = buildFilterByType(sourceMeta.name, sourceMeta.def.type, ideaPageId);
  if (!sourceFilter) {
    return 0;
  }

  const result = await queryCollection(databaseId, {
    filter: sourceFilter,
    page_size: 100,
  });

  return result.results.length;
}

async function getOutputCounts(ideaPageId) {
  const competitors = await countOutputItemsForIdea(env.NOTION_COMPETITORS_DB_ID, ideaPageId);
  const roadmap = await countOutputItemsForIdea(env.NOTION_ROADMAP_DB_ID, ideaPageId);
  const marketing = await countOutputItemsForIdea(env.NOTION_MARKETING_DB_ID, ideaPageId);
  return { competitors, roadmap, marketing };
}

function parseCurrentItemByType(type, pageProperties, titleValue) {
  const getByAliases = (aliases) => {
    const meta = findPropertyMeta(pageProperties, aliases);
    if (!meta) {
      return "";
    }
    return extractPlainTextByProperty(pageProperties[meta.name]);
  };

  if (type === "competitor") {
    return {
      name: titleValue,
      pricing: getByAliases(["Pricing"]) || "unknown",
      strengths: parseListValue(getByAliases(["Strengths"])),
      weaknesses: parseListValue(getByAliases(["Weaknesses"])),
      notes: getByAliases(["Notes"]) || "",
    };
  }

  if (type === "roadmap") {
    let complexity = getByAliases(["Complexity"]);
    if (!complexity) {
      const description = getByAliases(["Description"]);
      const match = /complexity\s*:\s*(high|medium|low)/i.exec(description);
      complexity = match ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` : "Medium";
    }

    return {
      feature: titleValue,
      priority: coerceEnumValue(getByAliases(["Priority"]), ["High", "Medium", "Low"], "Medium"),
      complexity: coerceEnumValue(complexity, ["High", "Medium", "Low"], "Medium"),
      status: getByAliases(["Status"]) || "Planned",
    };
  }

  if (type === "marketing") {
    return {
      channel: getByAliases(["Channel"]) || "Unknown",
      strategy: getByAliases(["Strategy"]) || titleValue,
      contentIdea: getByAliases(["Content Idea", "Campaign Idea"]) || "",
      priority: coerceEnumValue(getByAliases(["Priority"]), ["High", "Medium", "Low"], "Medium"),
    };
  }

  throw new Error(`Unsupported parse type: ${type}`);
}

function getSourceIdeaId(properties) {
  const sourceMeta = findPropertyMeta(properties, ["Source Idea", "Source"], [
    "rich_text",
    "title",
    "select",
    "multi_select",
  ]);
  if (!sourceMeta) {
    return "";
  }

  return extractPlainTextByProperty(properties[sourceMeta.name]);
}

async function listReviewItems({ types, ideaPageId, limit = 25 } = {}) {
  const requested = Array.isArray(types) && types.length ? types : ["competitor", "roadmap", "marketing"];
  const maxLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
  const items = [];

  for (const type of requested) {
    if (items.length >= maxLimit) {
      break;
    }

    const databaseId = getOutputDatabaseIdByType(type);
    const props = await getCollectionProperties(databaseId);
    const reviewMeta = findPropertyMeta(props, NEEDS_REVIEW_ALIASES, ["checkbox"]);
    if (!reviewMeta) {
      continue;
    }

    const notesMeta = findPropertyMeta(props, CORRECTION_NOTES_ALIASES, ["rich_text", "title"]);
    const sourceMeta = findPropertyMeta(props, ["Source Idea", "Source"], [
      "rich_text",
      "title",
      "select",
      "multi_select",
    ]);

    const andFilters = [{ property: reviewMeta.name, checkbox: { equals: true } }];
    if (ideaPageId && sourceMeta) {
      const sourceFilter = buildFilterByType(sourceMeta.name, sourceMeta.def.type, ideaPageId);
      if (sourceFilter) {
        andFilters.push(sourceFilter);
      }
    }

    const result = await queryCollection(databaseId, {
      filter: andFilters.length === 1 ? andFilters[0] : { and: andFilters },
      sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
      page_size: maxLimit - items.length,
    });

    for (const page of result.results) {
      const pageProps = page.properties || {};
      const title = getTitleValue(page);
      const correctionNotes = notesMeta ? extractPlainTextByProperty(pageProps[notesMeta.name]) : "";
      const reviewFlag = extractCheckboxByProperty(pageProps[reviewMeta.name]);
      if (!reviewFlag) {
        continue;
      }

      const sourceId = getSourceIdeaId(pageProps);
      if (ideaPageId && sourceId !== ideaPageId) {
        continue;
      }

      const currentItem = parseCurrentItemByType(type, pageProps, title);
      const correctionChecksum = crypto.createHash("sha256").update(correctionNotes || "").digest("hex");

      items.push({
        id: page.id,
        type,
        ideaPageId: sourceId,
        title,
        correctionNotes,
        correctionChecksum,
        lastEditedTime: page.last_edited_time,
        currentItem,
      });

      if (items.length >= maxLimit) {
        break;
      }
    }
  }

  return items;
}

async function updateOutputItemByPageId({ type, pageId, ideaPageId, item, reviewState = null }) {
  const databaseId = getOutputDatabaseIdByType(type);
  const collectionProps = await getCollectionProperties(databaseId);
  const titleProperty = await getTitlePropertyName(databaseId);

  const name =
    type === "competitor"
      ? item.name
      : type === "roadmap"
        ? item.feature
        : `${item.channel || "Channel"} - ${item.strategy || "Strategy"}`;

  const properties = {
    [titleProperty]: asTitle(name),
  };

  const sourceMeta = findPropertyMeta(collectionProps, ["Source Idea", "Source"], [
    "rich_text",
    "title",
    "select",
    "multi_select",
  ]);

  if (sourceMeta && ideaPageId) {
    const sourceValue = toNotionPropertyValue(sourceMeta.def, ideaPageId);
    if (sourceValue) {
      properties[sourceMeta.name] = sourceValue;
    }
  }

  const fieldMap = buildFieldMapForType(type, item);
  for (const field of fieldMap) {
    const meta = findPropertyMeta(collectionProps, field.aliases, field.allowedTypes || null);
    if (!meta) {
      continue;
    }
    const notionValue = toNotionPropertyValue(meta.def, field.value);
    if (notionValue) {
      properties[meta.name] = notionValue;
    }
  }

  applyReviewPropertiesToPayload(collectionProps, properties, reviewState);

  await notion.pages.update({ page_id: pageId, properties });
}

module.exports = {
  queryStartupIdeasToRun,
  getIdeaById,
  updateIdeaStatus,
  claimIdeaForRun,
  validateConfiguredSchemas,
  inspectSchemas: validateConfiguredSchemas,
  createOrUpsertCompetitors,
  createOrUpsertRoadmap,
  createOrUpsertMarketing,
  getOutputCounts,
  listReviewItems,
  updateOutputItemByPageId,
};
