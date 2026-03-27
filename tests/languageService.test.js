const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { detectInputLanguage, buildLanguageRule } = require("../server/services/languageService");

describe("detectInputLanguage", () => {
    it("detects Spanish", () => {
        assert.equal(detectInputLanguage("Una startup para la gestión de inventarios"), "Spanish");
    });

    it("detects English", () => {
        assert.equal(detectInputLanguage("A startup for the best inventory management product"), "English");
    });

    it("detects Chinese by script", () => {
        assert.equal(detectInputLanguage("一个创业公司"), "Chinese");
    });

    it("detects Arabic by script", () => {
        assert.equal(detectInputLanguage("شركة ناشئة"), "Arabic");
    });

    it("detects Japanese by script", () => {
        assert.equal(detectInputLanguage("スタートアップ"), "Japanese");
    });

    it("detects Korean by script", () => {
        assert.equal(detectInputLanguage("스타트업 회사"), "Korean");
    });

    it("returns null for empty input", () => {
        assert.equal(detectInputLanguage(""), null);
        assert.equal(detectInputLanguage(null), null);
    });

    it("returns null for ambiguous short text", () => {
        assert.equal(detectInputLanguage("ok"), null);
    });
});

describe("buildLanguageRule", () => {
    it("returns language-specific rule when hint provided", () => {
        const rule = buildLanguageRule({ languageHint: "Spanish" });
        assert.ok(rule.includes("Spanish"));
        assert.ok(rule.includes("LANGUAGE"));
    });

    it("returns generic rule when no hint", () => {
        const rule = buildLanguageRule({});
        assert.ok(rule.includes("same language"));
    });

    it("returns generic rule when called without args", () => {
        const rule = buildLanguageRule();
        assert.ok(rule.includes("same language"));
    });
});
