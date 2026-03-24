const SCRIPT_RULES = [
  { name: "Arabic", regex: /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/ },
  { name: "Cyrillic", regex: /[\u0400-\u04FF]/ },
  { name: "Chinese", regex: /[\u4E00-\u9FFF]/ },
  { name: "Japanese", regex: /[\u3040-\u30FF]/ },
  { name: "Korean", regex: /[\uAC00-\uD7AF]/ },
  { name: "Hebrew", regex: /[\u0590-\u05FF]/ },
  { name: "Thai", regex: /[\u0E00-\u0E7F]/ },
  { name: "Devanagari", regex: /[\u0900-\u097F]/ },
];

const WORD_HINTS = [
  { name: "Spanish", words: [" el ", " la ", " de ", " que ", " para ", " con ", " una ", " startup "] },
  { name: "English", words: [" the ", " and ", " for ", " with ", " users ", " startup ", " product "] },
  { name: "Portuguese", words: [" de ", " para ", " com ", " uma ", " nao ", " startup ", " produto "] },
  { name: "French", words: [" le ", " la ", " de ", " pour ", " avec ", " une ", " produit "] },
  { name: "Italian", words: [" il ", " la ", " per ", " con ", " una ", " prodotto "] },
  { name: "German", words: [" der ", " die ", " und ", " fur ", " mit ", " ein ", " produkt "] },
];

function normalizeText(value) {
  return ` ${String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function detectByScript(text) {
  for (const rule of SCRIPT_RULES) {
    if (rule.regex.test(text)) {
      return rule.name;
    }
  }
  return null;
}

function detectByWords(text) {
  const normalized = normalizeText(text);
  let best = { name: null, score: 0 };

  for (const hint of WORD_HINTS) {
    let score = 0;
    for (const word of hint.words) {
      if (normalized.includes(word)) {
        score += 1;
      }
    }

    if (score > best.score) {
      best = { name: hint.name, score };
    }
  }

  return best.score >= 2 ? best.name : null;
}

function detectInputLanguage(text) {
  const source = String(text || "").trim();
  if (!source) {
    return null;
  }

  return detectByScript(source) || detectByWords(source) || null;
}

function buildLanguageRule({ languageHint } = {}) {
  if (languageHint) {
    return `LANGUAGE: Use ${languageHint}. All human-readable strings in the JSON MUST be in ${languageHint}.`;
  }

  return "LANGUAGE: Use the same language as the startup idea text. All human-readable strings in the JSON MUST be in that language.";
}

module.exports = {
  detectInputLanguage,
  buildLanguageRule,
};
