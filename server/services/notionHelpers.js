const crypto = require("crypto");

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

function sha1(input) {
    return crypto.createHash("sha1").update(String(input || "")).digest("hex");
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

    if (def.type === "url") {
        const url = String(value || "").trim();
        if (!url) {
            return null;
        }
        return { url };
    }

    if (def.type === "relation") {
        if (Array.isArray(value)) {
            const relation = value
                .filter(Boolean)
                .map((id) => ({ id: String(id) }));
            return relation.length ? { relation } : null;
        }

        if (!value) {
            return null;
        }

        return { relation: [{ id: String(value) }] };
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

    if (property.type === "url") {
        return property.url || "";
    }

    if (property.type === "relation") {
        return (property.relation || []).map((v) => v.id).filter(Boolean).join(", ");
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

function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.max(0, Math.min(100, Math.round(n)));
}

function computeOverallScore(input = {}) {
    const penaltyMap = {
        unclear_pricing: 8,
        weak_evidence: 10,
        non_official: 6,
        contradictory: 12,
        outdated: 5,
    };

    const base =
        0.35 * Number(input.similarity_score || 0) +
        0.2 * Number(input.pricing_clarity || 0) +
        0.3 * Number(input.evidence_quality || 0) +
        0.15 * Number(input.traction_signals || 0);

    const penalty = (input.risk_flags || []).reduce((sum, key) => sum + (penaltyMap[key] || 0), 0);
    return clampScore(base - penalty);
}

function buildFieldMapForType(type, item) {
    if (type === "competitor") {
        return [
            {
                aliases: ["Source", "Data Source", "Origin"],
                value: item.source || "ai_generated",
                allowedTypes: ["select", "multi_select", "rich_text"],
            },
            { aliases: ["Pricing"], value: item.pricing || "unknown" },
            { aliases: ["Strengths"], value: (item.strengths || []).join(", ") || "unknown" },
            { aliases: ["Weaknesses"], value: (item.weaknesses || []).join(", ") || "unknown" },
            { aliases: ["Notes"], value: item.notes || "" },
            { aliases: ["Evidence", "Search Snippet", "Snippet"], value: item.search_snippet || "" },
            { aliases: ["Evidence Summary"], value: item.evidence_summary || item.search_snippet || "" },
            { aliases: ["Confidence"], value: item.confidence ?? 0.5, allowedTypes: ["number", "rich_text"] },
            {
                aliases: ["Category"],
                value: item.category || "direct",
                allowedTypes: ["select", "multi_select", "rich_text"],
            },
            {
                aliases: ["Pricing Model"],
                value: item.pricing_model || "unknown",
                allowedTypes: ["select", "multi_select", "rich_text"],
            },
            { aliases: ["ICP"], value: item.icp || "" },
            { aliases: ["Key Differentiators"], value: item.key_differentiators || "" },
            { aliases: ["Market"], value: item.market || "" },
            { aliases: ["Website", "URL"], value: item.website || "" },
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

function getOutputDatabaseIdByType(type) {
    const env = require("../config/env");
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

function isWowModeEnabled() {
    const env = require("../config/env");
    return Boolean(env.NOTION_UI_WOW_MODE);
}

function getOptionalDatabaseId(type) {
    const env = require("../config/env");
    if (type === "runs") {
        return env.NOTION_RUNS_DB_ID;
    }
    if (type === "evidence") {
        return env.NOTION_EVIDENCE_DB_ID;
    }
    if (type === "claims") {
        return env.NOTION_CLAIMS_DB_ID;
    }
    if (type === "feature_matrix") {
        return env.NOTION_FEATURE_MATRIX_DB_ID;
    }
    if (type === "scorecards") {
        return env.NOTION_SCORECARDS_DB_ID;
    }

    return null;
}

function shouldWriteWowEntity(type) {
    return isWowModeEnabled() && Boolean(getOptionalDatabaseId(type));
}

function shortIdeaKey(title) {
    return sanitizeKeyPart(title || "idea").slice(0, 24);
}

function buildRunId(ideaTitle) {
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
    return `run_${stamp}_${shortIdeaKey(ideaTitle)}`;
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

function requirePropertyByType({ properties, databaseLabel, propertyName, allowedTypes }) {
    const meta = findPropertyMeta(properties, [propertyName], allowedTypes);
    if (!meta) {
        throw new Error(
            `${databaseLabel} is missing required property '${propertyName}' with type(s): ${allowedTypes.join(", ")}`
        );
    }
    return meta;
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

function getSourceIdeaId(properties) {
    const sourceMeta =
        findPropertyMeta(properties, ["Source Idea", "Idea Source", "Startup Idea"], [
            "rich_text",
            "title",
            "select",
            "multi_select",
        ]) ||
        findPropertyMeta(properties, ["Source"], ["rich_text", "title"]);
    if (!sourceMeta) {
        return "";
    }

    return extractPlainTextByProperty(properties[sourceMeta.name]);
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
            website: getByAliases(["Website", "URL"]) || "unknown",
            source: getByAliases(["Source", "Data Source", "Origin"]) || "ai_generated",
            pricing: getByAliases(["Pricing"]) || "unknown",
            strengths: parseListValue(getByAliases(["Strengths"])),
            weaknesses: parseListValue(getByAliases(["Weaknesses"])),
            search_snippet: getByAliases(["Evidence", "Search Snippet", "Snippet"]) || "",
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

module.exports = {
    NEEDS_REVIEW_ALIASES,
    CORRECTION_NOTES_ALIASES,
    asRichText,
    asTitle,
    sanitizeKeyPart,
    sha1,
    buildKey,
    normalizePropertyName,
    findPropertyMeta,
    buildFilterByType,
    toNotionPropertyValue,
    getStatusValue,
    getStatusValueFromProperty,
    getTitleValue,
    getDescriptionValue,
    findFirstExistingPropertyName,
    extractPlainTextByProperty,
    extractCheckboxByProperty,
    parseListValue,
    coerceEnumValue,
    clampScore,
    computeOverallScore,
    buildFieldMapForType,
    getOutputDatabaseIdByType,
    isWowModeEnabled,
    getOptionalDatabaseId,
    shouldWriteWowEntity,
    shortIdeaKey,
    buildRunId,
    buildStatusFilter,
    buildStatusUpdateProperty,
    requirePropertyByType,
    applyReviewPropertiesToPayload,
    getSourceIdeaId,
    parseCurrentItemByType,
};
