const pino = require("pino");
const { Client } = require("@notionhq/client");
const crypto = require("crypto");

const env = require("../config/env");
const {
    findPropertyMeta,
    buildFilterByType,
    getStatusValue,
    getStatusValueFromProperty,
    getTitleValue,
    getDescriptionValue,
    extractPlainTextByProperty,
    extractCheckboxByProperty,
    parseListValue,
    coerceEnumValue,
    buildStatusFilter,
    getOutputDatabaseIdByType,
    getSourceIdeaId,
    parseCurrentItemByType,
    NEEDS_REVIEW_ALIASES,
    CORRECTION_NOTES_ALIASES,
} = require("./notionHelpers");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });
const notion = new Client({ auth: env.NOTION_TOKEN || env.NOTION_OAUTH_TOKEN });

const dbTitleCache = new Map();
const dataSourceCache = new Map();
const statusPropertyCache = new Map();
const collectionPropertiesCache = new Map();

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

async function countOutputItemsForIdea(databaseId, ideaPageId) {
    const props = await getCollectionProperties(databaseId);
    const sourceMeta = findPropertyMeta(props, ["Source Idea", "Idea Source", "Startup Idea"], [
        "rich_text",
        "title",
        "select",
        "multi_select",
    ]);
    const strictSourceMeta =
        findPropertyMeta(props, ["Source Idea", "Idea Source", "Startup Idea"], [
            "rich_text",
            "title",
            "select",
            "multi_select",
        ]) || sourceMeta;

    if (!strictSourceMeta) {
        return 0;
    }

    const sourceFilter = buildFilterByType(strictSourceMeta.name, strictSourceMeta.def.type, ideaPageId);
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
        const sourceMeta = findPropertyMeta(props, ["Source Idea", "Idea Source", "Startup Idea"], [
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

async function getRunById(runPageId) {
    const { shouldWriteWowEntity } = require("./notionHelpers");
    if (!runPageId || !shouldWriteWowEntity("runs")) {
        return null;
    }

    const page = await notion.pages.retrieve({ page_id: runPageId });
    const properties = page.properties || {};
    const readBy = (aliases) => {
        const meta = findPropertyMeta(properties, aliases);
        return meta ? extractPlainTextByProperty(properties[meta.name]) : "";
    };

    return {
        id: page.id,
        runId: getTitleValue(page),
        status: readBy(["Status"]),
        mode: readBy(["Mode"]),
        startedAt: readBy(["Started At"]),
        finishedAt: readBy(["Finished At"]),
        durationMs: Number(readBy(["Duration (ms)", "Duration"]) || 0),
        evidenceCount: Number(readBy(["Evidence Count"]) || 0),
        competitorsWritten: Number(readBy(["Competitors Written"]) || 0),
        roadmapItemsWritten: Number(readBy(["Roadmap Items Written"]) || 0),
        marketingItemsWritten: Number(readBy(["Marketing Items Written"]) || 0),
        errorStage: readBy(["Error Stage"]),
        errorMessage: readBy(["Error Message"]),
        runLog: readBy(["Run Log"]),
        artifactJson: readBy(["Artifact JSON"]),
    };
}

module.exports = {
    notion,
    getDatabaseProperties,
    getCollectionProperties,
    getTitlePropertyName,
    getStatusPropertyMeta,
    resolveDataSourceId,
    queryCollection,
    findByKey,
    findBySourceAndTitle,
    queryStartupIdeasToRun,
    getIdeaById,
    countOutputItemsForIdea,
    getOutputCounts,
    listReviewItems,
    getRunById,
};
