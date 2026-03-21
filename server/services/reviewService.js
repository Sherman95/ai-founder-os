const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { ideaAnalyzer } = require("../agents/ideaAnalyzer");
const { generateJson, isQuotaError } = require("./geminiService");
const { competitorSchema } = require("../schemas/competitor.schema");
const { roadmapItemSchema } = require("../schemas/roadmap.schema");
const { marketingItemSchema } = require("../schemas/marketing.schema");

const promptByType = {
  competitor: fs.readFileSync(path.resolve(__dirname, "../../prompts/competitorCorrection.md"), "utf8"),
  roadmap: fs.readFileSync(path.resolve(__dirname, "../../prompts/roadmapCorrection.md"), "utf8"),
  marketing: fs.readFileSync(path.resolve(__dirname, "../../prompts/marketingCorrection.md"), "utf8"),
};

const schemaByType = {
  competitor: competitorSchema,
  roadmap: roadmapItemSchema,
  marketing: marketingItemSchema,
};

const inFlightLocks = new Set();
const appliedChecksumByRow = new Map();

function checksumText(value) {
  return crypto.createHash("sha256").update(String(value || "").trim()).digest("hex");
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function fallbackCorrection(type, currentItem, notes) {
  if (type === "competitor") {
    return competitorSchema.parse({
      name: currentItem.name || "Corrected competitor",
      pricing: currentItem.pricing || "unknown",
      strengths: currentItem.strengths?.length ? currentItem.strengths : ["updated per review"],
      weaknesses: currentItem.weaknesses?.length ? currentItem.weaknesses : ["updated per review"],
      notes: `${currentItem.notes || ""} [review] ${String(notes || "").slice(0, 300)}`.trim(),
    });
  }

  if (type === "roadmap") {
    return roadmapItemSchema.parse({
      feature: currentItem.feature || "Corrected roadmap item",
      priority: ["High", "Medium", "Low"].includes(currentItem.priority) ? currentItem.priority : "Medium",
      complexity: ["High", "Medium", "Low"].includes(currentItem.complexity) ? currentItem.complexity : "Medium",
      status: "Planned",
    });
  }

  return marketingItemSchema.parse({
    channel: currentItem.channel || "LinkedIn",
    strategy: currentItem.strategy || `Revised strategy: ${String(notes || "").slice(0, 80)}`,
    contentIdea: currentItem.contentIdea || "Revised content plan",
    priority: ["High", "Medium", "Low"].includes(currentItem.priority) ? currentItem.priority : "Medium",
  });
}

function normalizeCurrentItem(type, item) {
  if (type === "competitor") {
    return {
      name: item?.name || "",
      pricing: item?.pricing || "",
      strengths: Array.isArray(item?.strengths) ? item.strengths : parseList(item?.strengths),
      weaknesses: Array.isArray(item?.weaknesses) ? item.weaknesses : parseList(item?.weaknesses),
      notes: item?.notes || "",
    };
  }

  if (type === "roadmap") {
    return {
      feature: item?.feature || "",
      priority: item?.priority || "Medium",
      complexity: item?.complexity || "Medium",
      status: item?.status || "Planned",
    };
  }

  return {
    channel: item?.channel || "",
    strategy: item?.strategy || "",
    contentIdea: item?.contentIdea || "",
    priority: item?.priority || "Medium",
  };
}

function buildCorrectionPrompt({ type, analysis, currentItem, correctionNotes }) {
  return [
    promptByType[type],
    "",
    "IDEA_ANALYSIS_JSON:",
    JSON.stringify(analysis, null, 2),
    "",
    "CURRENT_ITEM_JSON:",
    JSON.stringify(currentItem, null, 2),
    "",
    "CORRECTION_NOTES:",
    String(correctionNotes || ""),
    "",
    "Return corrected JSON only matching schema.",
  ].join("\n");
}

async function listReviews({ notionProvider, types, ideaPageId, limit = 25 }) {
  const items = await notionProvider.listReviewItems({ types, ideaPageId, limit });
  return {
    count: items.length,
    items: items.map((item) => ({
      id: item.id,
      type: item.type,
      ideaPageId: item.ideaPageId,
      title: item.title,
      correctionNotes: item.correctionNotes || "",
      lastEditedTime: item.lastEditedTime,
    })),
  };
}

async function applyCorrections({ notionProvider, types, ideaPageId, limit = 10 }) {
  const startedAt = Date.now();
  const maxItems = Math.min(Math.max(Number(limit) || 10, 1), 50);
  const reviewItems = await notionProvider.listReviewItems({ types, ideaPageId, limit: maxItems });

  const errors = [];
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  const analysisByIdea = new Map();

  for (const reviewItem of reviewItems) {
    processed += 1;

    if (inFlightLocks.has(reviewItem.id)) {
      skipped += 1;
      continue;
    }

    inFlightLocks.add(reviewItem.id);

    try {
      const notes = String(reviewItem.correctionNotes || "").trim();
      if (!notes) {
        skipped += 1;
        continue;
      }

      const checksum = reviewItem.correctionChecksum || checksumText(notes);
      if (appliedChecksumByRow.get(reviewItem.id) === checksum) {
        skipped += 1;
        continue;
      }

      if (!reviewItem.ideaPageId) {
        skipped += 1;
        errors.push({ id: reviewItem.id, error: "Missing ideaPageId in output row" });
        continue;
      }

      if (!analysisByIdea.has(reviewItem.ideaPageId)) {
        const idea = await notionProvider.getIdeaById(reviewItem.ideaPageId);
        const analysis = await ideaAnalyzer(idea);
        analysisByIdea.set(reviewItem.ideaPageId, analysis);
      }

      const analysis = analysisByIdea.get(reviewItem.ideaPageId);
      const currentItem = normalizeCurrentItem(reviewItem.type, reviewItem.currentItem || {});
      const prompt = buildCorrectionPrompt({
        type: reviewItem.type,
        analysis,
        currentItem,
        correctionNotes: notes,
      });

      let corrected;
      try {
        corrected = await generateJson({
          prompt,
          schema: schemaByType[reviewItem.type],
        });
      } catch (error) {
        if (isQuotaError(error)) {
          corrected = fallbackCorrection(reviewItem.type, currentItem, notes);
        } else {
          throw error;
        }
      }

      await notionProvider.updateOutputItemByPageId({
        type: reviewItem.type,
        pageId: reviewItem.id,
        ideaPageId: reviewItem.ideaPageId,
        item: corrected,
        reviewState: {
          needsReview: false,
          correctionNotes: "",
        },
      });

      appliedChecksumByRow.set(reviewItem.id, checksum);
      updated += 1;
    } catch (error) {
      errors.push({ id: reviewItem.id, error: error?.message || String(error) });
    } finally {
      inFlightLocks.delete(reviewItem.id);
    }
  }

  return {
    processed,
    updated,
    skipped,
    errors,
    durationMs: Date.now() - startedAt,
  };
}

module.exports = {
  listReviews,
  applyCorrections,
};
