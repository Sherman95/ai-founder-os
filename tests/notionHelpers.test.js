const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
    sanitizeKeyPart,
    buildKey,
    clampScore,
    computeOverallScore,
    coerceEnumValue,
    asRichText,
    asTitle,
    getTitleValue,
    getStatusValue,
    extractPlainTextByProperty,
    extractCheckboxByProperty,
    parseListValue,
    buildFilterByType,
    buildStatusFilter,
    buildStatusUpdateProperty,
} = require("../server/services/notionHelpers");

describe("sanitizeKeyPart", () => {
    it("lowercases and strips special chars", () => {
        assert.equal(sanitizeKeyPart("Hello World!"), "hello-world");
    });

    it("defaults to 'item' for falsy input", () => {
        assert.equal(sanitizeKeyPart(null), "item");
        assert.equal(sanitizeKeyPart(""), "item");
    });

    it("truncates to 80 chars", () => {
        const long = "a".repeat(100);
        assert.equal(sanitizeKeyPart(long).length, 80);
    });
});

describe("buildKey", () => {
    it("builds composite key", () => {
        const key = buildKey("page123", "competitor", "Acme Corp");
        assert.equal(key, "page123:competitor:acme-corp");
    });
});

describe("clampScore", () => {
    it("clamps to 0-100 range", () => {
        assert.equal(clampScore(150), 100);
        assert.equal(clampScore(-10), 0);
        assert.equal(clampScore(42.7), 43);
    });

    it("returns 0 for non-finite values", () => {
        assert.equal(clampScore(NaN), 0);
        assert.equal(clampScore("abc"), 0);
    });
});

describe("computeOverallScore", () => {
    it("computes weighted score", () => {
        const score = computeOverallScore({
            similarity_score: 80,
            pricing_clarity: 60,
            evidence_quality: 70,
            traction_signals: 50,
            risk_flags: [],
        });
        assert.ok(score > 0 && score <= 100);
    });

    it("applies penalties for risk flags", () => {
        const clean = computeOverallScore({
            similarity_score: 80,
            pricing_clarity: 60,
            evidence_quality: 70,
            traction_signals: 50,
            risk_flags: [],
        });
        const risky = computeOverallScore({
            similarity_score: 80,
            pricing_clarity: 60,
            evidence_quality: 70,
            traction_signals: 50,
            risk_flags: ["weak_evidence", "contradictory"],
        });
        assert.ok(risky < clean);
    });

    it("handles empty input", () => {
        assert.equal(computeOverallScore(), 0);
    });
});

describe("coerceEnumValue", () => {
    it("returns value if in allowed list", () => {
        assert.equal(coerceEnumValue("High", ["High", "Medium", "Low"], "Medium"), "High");
    });

    it("returns fallback if not in allowed list", () => {
        assert.equal(coerceEnumValue("Invalid", ["High", "Medium", "Low"], "Medium"), "Medium");
    });
});

describe("asRichText", () => {
    it("wraps value in Notion rich text format", () => {
        const result = asRichText("hello");
        assert.deepEqual(result, {
            rich_text: [{ type: "text", text: { content: "hello" } }],
        });
    });

    it("truncates to 2000 chars", () => {
        const long = "x".repeat(3000);
        const result = asRichText(long);
        assert.equal(result.rich_text[0].text.content.length, 2000);
    });
});

describe("asTitle", () => {
    it("wraps value in Notion title format", () => {
        const result = asTitle("Test");
        assert.deepEqual(result, {
            title: [{ type: "text", text: { content: "Test" } }],
        });
    });

    it("truncates to 200 chars", () => {
        const long = "y".repeat(300);
        const result = asTitle(long);
        assert.equal(result.title[0].text.content.length, 200);
    });
});

describe("getTitleValue", () => {
    it("extracts title from page properties", () => {
        const page = {
            properties: {
                Name: { type: "title", title: [{ plain_text: "My Startup" }] },
            },
        };
        assert.equal(getTitleValue(page), "My Startup");
    });

    it("returns fallback for missing title", () => {
        assert.equal(getTitleValue({ properties: {} }), "Untitled startup idea");
    });
});

describe("getStatusValue", () => {
    it("reads status type", () => {
        const page = {
            properties: { Status: { type: "status", status: { name: "Done" } } },
        };
        assert.equal(getStatusValue(page), "Done");
    });

    it("reads select type", () => {
        const page = {
            properties: { Estado: { type: "select", select: { name: "Running" } } },
        };
        assert.equal(getStatusValue(page), "Running");
    });
});

describe("extractPlainTextByProperty", () => {
    it("extracts from rich_text", () => {
        const prop = { type: "rich_text", rich_text: [{ plain_text: "Hello" }] };
        assert.equal(extractPlainTextByProperty(prop), "Hello");
    });

    it("returns empty string for null", () => {
        assert.equal(extractPlainTextByProperty(null), "");
    });

    it("extracts from number", () => {
        const prop = { type: "number", number: 42 };
        assert.equal(extractPlainTextByProperty(prop), "42");
    });
});

describe("extractCheckboxByProperty", () => {
    it("reads checkbox true", () => {
        assert.equal(extractCheckboxByProperty({ type: "checkbox", checkbox: true }), true);
    });

    it("reads checkbox false", () => {
        assert.equal(extractCheckboxByProperty({ type: "checkbox", checkbox: false }), false);
    });

    it("returns false for null", () => {
        assert.equal(extractCheckboxByProperty(null), false);
    });
});

describe("parseListValue", () => {
    it("splits CSV string", () => {
        assert.deepEqual(parseListValue("a, b, c"), ["a", "b", "c"]);
    });

    it("limits to 8 items", () => {
        const input = Array.from({ length: 15 }, (_, i) => `item${i}`).join(",");
        assert.equal(parseListValue(input).length, 8);
    });
});

describe("buildFilterByType", () => {
    it("builds title filter", () => {
        const filter = buildFilterByType("Name", "title", "test");
        assert.deepEqual(filter, { property: "Name", title: { equals: "test" } });
    });

    it("builds select filter", () => {
        const filter = buildFilterByType("Status", "select", "Done");
        assert.deepEqual(filter, { property: "Status", select: { equals: "Done" } });
    });

    it("returns null for unsupported type", () => {
        assert.equal(buildFilterByType("X", "formula", "test"), null);
    });
});

describe("buildStatusFilter", () => {
    it("builds status filter", () => {
        const filter = buildStatusFilter("Status", "status", "Running");
        assert.deepEqual(filter, { property: "Status", status: { equals: "Running" } });
    });
});

describe("buildStatusUpdateProperty", () => {
    it("builds status update", () => {
        assert.deepEqual(buildStatusUpdateProperty("status", "Done"), { status: { name: "Done" } });
    });

    it("builds select update", () => {
        assert.deepEqual(buildStatusUpdateProperty("select", "Done"), { select: { name: "Done" } });
    });
});
