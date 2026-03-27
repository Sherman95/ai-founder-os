const pino = require("pino");

const env = require("../config/env");
const {
    asRichText,
    asTitle,
    sha1,
    sanitizeKeyPart,
    buildKey,
    findPropertyMeta,
    toNotionPropertyValue,
    findFirstExistingPropertyName,
    buildFieldMapForType,
    buildStatusUpdateProperty,
    requirePropertyByType,
    applyReviewPropertiesToPayload,
    getOptionalDatabaseId,
    shouldWriteWowEntity,
    buildRunId,
    clampScore,
    computeOverallScore,
} = require("./notionHelpers");
const {
    notion,
    getCollectionProperties,
    getTitlePropertyName,
    getStatusPropertyMeta,
    resolveDataSourceId,
    queryCollection,
    findByKey,
    findBySourceAndTitle,
} = require("./notionQueries");

const logger = pino({ level: process.env.LOG_LEVEL || "info" });

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
    const { getStatusValueFromProperty } = require("./notionHelpers");
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

async function upsertOutputItem(databaseId, ideaPageId, type, name, fieldMap, reviewState = null, extraProperties = []) {
    const key = buildKey(ideaPageId, type, name);
    const collectionProps = await getCollectionProperties(databaseId);
    const titleProperty = await getTitlePropertyName(databaseId);
    const titleMeta = { name: titleProperty, def: collectionProps[titleProperty] };
    const keyMeta = findPropertyMeta(collectionProps, ["Key"], ["rich_text", "title"]);
    const sourceMeta = findPropertyMeta(collectionProps, ["Source Idea", "Idea Source", "Startup Idea"], [
        "rich_text",
        "title",
        "select",
        "multi_select",
    ]);
    const strictSourceMeta =
        findPropertyMeta(collectionProps, ["Source Idea", "Idea Source", "Startup Idea"], [
            "rich_text",
            "title",
            "select",
            "multi_select",
        ]) || sourceMeta;

    let existing = null;
    if (keyMeta) {
        existing = await findByKey(databaseId, key);
    }
    if (!existing) {
        existing = await findBySourceAndTitle(databaseId, strictSourceMeta, ideaPageId, titleMeta, name);
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

    if (strictSourceMeta) {
        const sourceValue = toNotionPropertyValue(strictSourceMeta.def, ideaPageId);
        if (sourceValue) {
            properties[strictSourceMeta.name] = sourceValue;
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

    for (const field of extraProperties) {
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

async function createOrUpsertCompetitors(ideaPageId, competitors, options = {}) {
    for (const competitor of competitors) {
        const fieldMap = buildFieldMapForType("competitor", competitor);
        const relatedEvidence = (options.evidenceItems || [])
            .filter((item) => {
                const snippet = String(item.snippet || "").toLowerCase();
                return snippet.includes(String(competitor.name || "").toLowerCase());
            })
            .map((item) => item.id)
            .filter(Boolean)
            .slice(0, 8);

        const extraProperties = [
            {
                aliases: ["Run"],
                value: options.runPageId,
                allowedTypes: ["relation", "rich_text", "title"],
            },
            {
                aliases: ["Evidence"],
                value: relatedEvidence,
                allowedTypes: ["relation", "rich_text", "title"],
            },
        ];

        const pageId = await upsertOutputItem(
            env.NOTION_COMPETITORS_DB_ID,
            ideaPageId,
            "competitor",
            competitor.name,
            fieldMap,
            null,
            extraProperties
        );

        competitor.pageId = pageId;
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

async function updateOutputItemByPageId({ type, pageId, ideaPageId, item, reviewState = null }) {
    const { getOutputDatabaseIdByType } = require("./notionHelpers");
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

    const sourceMeta = findPropertyMeta(collectionProps, ["Source Idea", "Idea Source", "Startup Idea"], [
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

async function upsertGenericEntity({
    databaseId,
    key,
    title,
    ideaPageId,
    fieldMap,
    extraProperties = [],
}) {
    const collectionProps = await getCollectionProperties(databaseId);
    const titleProperty = await getTitlePropertyName(databaseId);
    const keyMeta = findPropertyMeta(collectionProps, ["Key"], ["rich_text", "title"]);
    const sourceMeta = findPropertyMeta(collectionProps, ["Source Idea", "Idea", "Startup Idea"], [
        "relation",
        "rich_text",
        "title",
        "select",
        "multi_select",
    ]);
    const titleMeta = { name: titleProperty, def: collectionProps[titleProperty] };

    let existing = null;
    if (keyMeta) {
        existing = await findByKey(databaseId, key);
    }
    if (!existing && sourceMeta) {
        existing = await findBySourceAndTitle(databaseId, sourceMeta, ideaPageId, titleMeta, title);
    }

    const properties = {
        [titleProperty]: asTitle(title),
    };

    if (keyMeta) {
        const keyValue = toNotionPropertyValue(keyMeta.def, key);
        if (keyValue) {
            properties[keyMeta.name] = keyValue;
        }
    }

    if (sourceMeta && ideaPageId) {
        const sourceValue = toNotionPropertyValue(sourceMeta.def, ideaPageId);
        if (sourceValue) {
            properties[sourceMeta.name] = sourceValue;
        }
    }

    for (const field of [...fieldMap, ...extraProperties]) {
        const meta = findPropertyMeta(collectionProps, field.aliases, field.allowedTypes || null);
        if (!meta) {
            continue;
        }
        const notionValue = toNotionPropertyValue(meta.def, field.value);
        if (notionValue) {
            properties[meta.name] = notionValue;
        }
    }

    if (existing) {
        await notion.pages.update({ page_id: existing.id, properties });
        return existing.id;
    }

    const created = await createPageInCollection(databaseId, properties);
    return created.id;
}

async function createRun(ideaPage, meta = {}) {
    if (!shouldWriteWowEntity("runs")) {
        return null;
    }

    const runsDbId = getOptionalDatabaseId("runs");
    const runId = buildRunId(ideaPage?.title);
    const stageLog = `Run started at ${meta.startedAt || new Date().toISOString()}`;

    const id = await upsertGenericEntity({
        databaseId: runsDbId,
        key: runId,
        title: runId,
        ideaPageId: ideaPage.id,
        fieldMap: [
            { aliases: ["Status"], value: meta.status || "Running", allowedTypes: ["status", "select", "multi_select", "rich_text"] },
            { aliases: ["Mode"], value: meta.mode || "live", allowedTypes: ["select", "multi_select", "rich_text"] },
            { aliases: ["Web Search Enabled"], value: Boolean(meta.webSearchEnabled), allowedTypes: ["checkbox", "select"] },
            { aliases: ["Web Provider"], value: meta.webProvider || "none", allowedTypes: ["select", "multi_select", "rich_text"] },
            { aliases: ["Started At"], value: meta.startedAt || new Date().toISOString(), allowedTypes: ["date", "rich_text"] },
            { aliases: ["Version"], value: meta.version || "0.4.0", allowedTypes: ["rich_text", "title"] },
            { aliases: ["Tag/Release"], value: meta.tagRelease || "", allowedTypes: ["url", "rich_text"] },
            { aliases: ["Run Log"], value: stageLog, allowedTypes: ["rich_text", "title"] },
            { aliases: ["Search Queries"], value: "", allowedTypes: ["rich_text", "title"] },
        ],
    });

    return { id, runId };
}

async function updateRun(runPageId, patch = {}) {
    if (!runPageId || !shouldWriteWowEntity("runs")) {
        return;
    }

    const runsDbId = getOptionalDatabaseId("runs");
    const collectionProps = await getCollectionProperties(runsDbId);
    const properties = {};
    const fields = [
        { aliases: ["Status"], value: patch.status, allowedTypes: ["status", "select", "multi_select", "rich_text"] },
        { aliases: ["Finished At"], value: patch.finishedAt, allowedTypes: ["date", "rich_text"] },
        { aliases: ["Duration (ms)", "Duration"], value: patch.durationMs, allowedTypes: ["number", "rich_text"] },
        { aliases: ["Error Stage"], value: patch.errorStage, allowedTypes: ["select", "multi_select", "rich_text"] },
        { aliases: ["Error Message"], value: patch.errorMessage, allowedTypes: ["rich_text", "title"] },
        { aliases: ["Run Log"], value: patch.runLog, allowedTypes: ["rich_text", "title"] },
        { aliases: ["Search Queries"], value: patch.searchQueries, allowedTypes: ["rich_text", "title"] },
        { aliases: ["Evidence Count"], value: patch.evidenceCount, allowedTypes: ["number", "rich_text"] },
        { aliases: ["Competitors Written"], value: patch.competitorsWritten, allowedTypes: ["number", "rich_text"] },
        { aliases: ["Roadmap Items Written"], value: patch.roadmapItemsWritten, allowedTypes: ["number", "rich_text"] },
        { aliases: ["Marketing Items Written"], value: patch.marketingItemsWritten, allowedTypes: ["number", "rich_text"] },
        { aliases: ["Judge Summary"], value: patch.judgeSummary, allowedTypes: ["rich_text", "title"] },
        { aliases: ["Artifact JSON"], value: patch.artifactJson, allowedTypes: ["rich_text", "url"] },
    ];

    for (const field of fields) {
        if (field.value === undefined) {
            continue;
        }
        const meta = findPropertyMeta(collectionProps, field.aliases, field.allowedTypes || null);
        if (!meta) {
            continue;
        }
        const notionValue = toNotionPropertyValue(meta.def, field.value);
        if (notionValue) {
            properties[meta.name] = notionValue;
        }
    }

    if (Object.keys(properties).length === 0) {
        return;
    }

    await notion.pages.update({ page_id: runPageId, properties });
}

async function finalizeRun(runPageId, patch = {}) {
    await updateRun(runPageId, patch);
}

async function createOrUpsertEvidence({ runPageId, ideaPageId, evidenceRows = [], mode = "live" }) {
    if (!shouldWriteWowEntity("evidence")) {
        return [];
    }

    const evidenceDbId = getOptionalDatabaseId("evidence");
    const written = [];

    for (let i = 0; i < evidenceRows.length; i += 1) {
        const row = evidenceRows[i];
        const url = String(row.url || "").trim();
        if (!url) {
            continue;
        }

        const evidenceId = `ev_${sha1(url).slice(0, 12)}`;
        const key = `${runPageId || "no_run"}:${sha1(url)}`;
        const confidence = mode === "replay" ? 0.6 : 0.8;

        const id = await upsertGenericEntity({
            databaseId: evidenceDbId,
            key,
            title: evidenceId,
            ideaPageId,
            fieldMap: [
                { aliases: ["Query"], value: row.query || "", allowedTypes: ["rich_text", "title"] },
                { aliases: ["Title"], value: row.title || "", allowedTypes: ["rich_text", "title"] },
                { aliases: ["URL", "Website"], value: url, allowedTypes: ["url", "rich_text"] },
                { aliases: ["Domain"], value: row.domain || "", allowedTypes: ["select", "multi_select", "rich_text"] },
                { aliases: ["Snippet", "Evidence"], value: row.snippet || "", allowedTypes: ["rich_text", "title"] },
                { aliases: ["Retrieved At"], value: new Date().toISOString(), allowedTypes: ["date", "rich_text"] },
                {
                    aliases: ["Source Type"],
                    value: row.url?.includes("pricing") ? "pricing_page" : "web_search",
                    allowedTypes: ["select", "multi_select", "rich_text"],
                },
                { aliases: ["Confidence"], value: confidence, allowedTypes: ["number", "rich_text"] },
                {
                    aliases: ["Is Official Site"],
                    value: Boolean(row.domain) && String(row.url || "").includes(String(row.domain || "")),
                    allowedTypes: ["checkbox", "select"],
                },
            ],
            extraProperties: [
                {
                    aliases: ["Run"],
                    value: runPageId,
                    allowedTypes: ["relation", "rich_text", "title"],
                },
            ],
        });

        written.push({
            id,
            key,
            url,
            snippet: row.snippet || "",
            domain: row.domain || "",
            query: row.query || "",
            title: row.title || "",
        });
    }

    return written;
}

async function createOrUpsertClaims({ runPageId, ideaPageId, claims = [], competitors = [], evidenceItems = [] }) {
    if (!shouldWriteWowEntity("claims")) {
        return [];
    }

    const claimsDbId = getOptionalDatabaseId("claims");
    const competitorByName = new Map((competitors || []).map((item) => [String(item.name || "").toLowerCase(), item]));
    const evidenceByUrl = new Map((evidenceItems || []).map((item) => [item.url, item]));
    const written = [];

    for (const claim of claims) {
        const statement = claim.statement || claim.claim || "";
        const competitorName = claim.competitor_name || "Unknown Competitor";
        const key = `${runPageId || "no_run"}:${sanitizeKeyPart(competitorName)}:${claim.claim_type}:${sha1(statement)}`;
        const hasEvidence = Array.isArray(claim.evidence_urls) && claim.evidence_urls.length > 0;
        const verdict = hasEvidence ? claim.verdict : "unknown";
        const sourceCompetitor = competitorByName.get(String(competitorName).toLowerCase());
        const evidenceIds = (claim.evidence_urls || [])
            .map((url) => evidenceByUrl.get(url)?.id)
            .filter(Boolean)
            .slice(0, 12);

        const id = await upsertGenericEntity({
            databaseId: claimsDbId,
            key,
            title: claim.claim || statement.slice(0, 120) || "Claim",
            ideaPageId,
            fieldMap: [
                {
                    aliases: ["Claim Type"],
                    value: claim.claim_type || "other",
                    allowedTypes: ["select", "multi_select", "rich_text"],
                },
                { aliases: ["Statement"], value: statement, allowedTypes: ["rich_text", "title"] },
                {
                    aliases: ["Verdict"],
                    value: verdict,
                    allowedTypes: ["select", "multi_select", "rich_text"],
                },
                { aliases: ["Confidence"], value: claim.confidence ?? 0.5, allowedTypes: ["number", "rich_text"] },
                { aliases: ["Why it matters", "Why it matters?"], value: claim.why_it_matters || "", allowedTypes: ["rich_text", "title"] },
                { aliases: ["Needs Review"], value: verdict === "unknown", allowedTypes: ["checkbox"] },
                { aliases: ["Correction Notes"], value: "", allowedTypes: ["rich_text", "title"] },
            ],
            extraProperties: [
                { aliases: ["Run"], value: runPageId, allowedTypes: ["relation", "rich_text", "title"] },
                {
                    aliases: ["Competitor"],
                    value: sourceCompetitor?.pageId,
                    allowedTypes: ["relation", "rich_text", "title"],
                },
                { aliases: ["Evidence"], value: evidenceIds, allowedTypes: ["relation", "rich_text", "title"] },
            ],
        });

        written.push({ id, key });
    }

    return written;
}

async function createOrUpsertFeatureMatrix({ runPageId, ideaPageId, featureMatrix = [], competitors = [], evidenceItems = [] }) {
    if (!shouldWriteWowEntity("feature_matrix")) {
        return [];
    }

    const matrixDbId = getOptionalDatabaseId("feature_matrix");
    const evidenceByUrl = new Map((evidenceItems || []).map((item) => [item.url, item]));
    const written = [];

    for (const row of featureMatrix) {
        const competitorName = row.competitor_name || "Unknown Competitor";
        const key = `${runPageId || "no_run"}:${sanitizeKeyPart(competitorName)}:${sanitizeKeyPart(row.feature)}`;
        const evidenceIds = (row.evidence_urls || [])
            .map((url) => evidenceByUrl.get(url)?.id)
            .filter(Boolean)
            .slice(0, 12);

        const id = await upsertGenericEntity({
            databaseId: matrixDbId,
            key,
            title: row.feature || "Feature",
            ideaPageId,
            fieldMap: [
                { aliases: ["Support"], value: row.support || "unknown", allowedTypes: ["select", "multi_select", "rich_text"] },
                { aliases: ["Notes"], value: row.notes || "", allowedTypes: ["rich_text", "title"] },
                { aliases: ["Confidence"], value: row.confidence ?? 0.5, allowedTypes: ["number", "rich_text"] },
                {
                    aliases: ["Feature Category"],
                    value: row.feature_category || "core",
                    allowedTypes: ["select", "multi_select", "rich_text"],
                },
            ],
            extraProperties: [
                { aliases: ["Run"], value: runPageId, allowedTypes: ["relation", "rich_text", "title"] },
                { aliases: ["Evidence"], value: evidenceIds, allowedTypes: ["relation", "rich_text", "title"] },
            ],
        });

        written.push({ id, key });
    }

    return written;
}

async function createOrUpsertScorecards({ runPageId, ideaPageId, scorecardInputs = [] }) {
    if (!shouldWriteWowEntity("scorecards")) {
        return [];
    }

    const scoreDbId = getOptionalDatabaseId("scorecards");
    const written = [];

    for (const input of scorecardInputs) {
        const competitorName = input.competitor_name || "Unknown Competitor";
        const key = `${runPageId || "no_run"}:${sanitizeKeyPart(competitorName)}`;
        const summary = [
            `Similarity: ${clampScore(input.similarity_score)}`,
            `Pricing clarity: ${clampScore(input.pricing_clarity)}`,
            `Evidence quality: ${clampScore(input.evidence_quality)}`,
            `Traction signals: ${clampScore(input.traction_signals)}`,
            `Risk flags: ${(input.risk_flags || []).join(", ") || "none"}`,
        ].join("\n");

        const id = await upsertGenericEntity({
            databaseId: scoreDbId,
            key,
            title: `${competitorName} Scorecard`,
            ideaPageId,
            fieldMap: [
                { aliases: ["Overall Score"], value: computeOverallScore(input), allowedTypes: ["number", "rich_text"] },
                { aliases: ["Similarity Score"], value: clampScore(input.similarity_score), allowedTypes: ["number", "rich_text"] },
                { aliases: ["Pricing Clarity"], value: clampScore(input.pricing_clarity), allowedTypes: ["number", "rich_text"] },
                { aliases: ["Evidence Quality"], value: clampScore(input.evidence_quality), allowedTypes: ["number", "rich_text"] },
                { aliases: ["Traction Signals"], value: clampScore(input.traction_signals), allowedTypes: ["number", "rich_text"] },
                {
                    aliases: ["Risk Flags"],
                    value: input.risk_flags || [],
                    allowedTypes: ["multi_select", "select", "rich_text"],
                },
                { aliases: ["Summary"], value: summary, allowedTypes: ["rich_text", "title"] },
            ],
            extraProperties: [
                { aliases: ["Run"], value: runPageId, allowedTypes: ["relation", "rich_text", "title"] },
            ],
        });

        written.push({ id, key });
    }

    return written;
}

module.exports = {
    createPageInCollection,
    updateIdeaStatus,
    claimIdeaForRun,
    validateConfiguredSchemas,
    upsertOutputItem,
    createOrUpsertCompetitors,
    createOrUpsertRoadmap,
    createOrUpsertMarketing,
    updateOutputItemByPageId,
    upsertGenericEntity,
    createRun,
    updateRun,
    finalizeRun,
    createOrUpsertEvidence,
    createOrUpsertClaims,
    createOrUpsertFeatureMatrix,
    createOrUpsertScorecards,
};
