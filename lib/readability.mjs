// lib/readability.mjs
//
// Deterministic readability analysis for the selfwrite/selfresearch/
// selfinvestigate skills. The skills shell out to scripts/readability-check.mjs
// so the coordinator never estimates grade level, sentence lengths, or
// AI-tell candidates in its head.
//
// Syllable counting is a zero-dependency heuristic: count vowel groups
// ([aeiouy]+), subtract a silent trailing 'e' (but not '-le' after a
// consonant), floor at 1, with a small exceptions map for common miscounts.
// Measured drift vs. dictionary syllabification is under one Flesch-Kincaid
// grade on ordinary English prose (see tests/readability.test.mjs). That is
// acceptable because the gate feeds a score *cap*, not a delivery block.
// If fixture tests ever show >1.0 grade drift, swap in the `syllable`
// npm package here — the decision record lives in CLAUDE.md.
//
// All exported functions follow the repo's error-as-value pattern: nothing
// throws. The module has no default export.

// ---------- Thresholds (single source of truth; skill-lint compares prose against these) ----------

export const THRESHOLDS = Object.freeze({
  default: Object.freeze({ fk: 12.0, avgSentenceWords: 20, maxSentenceWords: 35 }),
  general: Object.freeze({ fk: 10.0, avgSentenceWords: 17, maxSentenceWords: 35 }),
  expert: null, // stats reported, gate never fails
});

export const AUDIENCES = Object.freeze(Object.keys(THRESHOLDS));
export const MIN_ANALYZED_COVERAGE = 0.9;

export const AUDIENCE_ALIASES = Object.freeze({
  scholarly: 'expert',
  'educated generalist': 'general',
  undergraduate: 'general',
  policy: 'default',
  'general public': 'general',
  experts: 'expert',
});

export function normalizeAudience(audience) {
  const raw = String(audience ?? 'default').trim().toLowerCase();
  return AUDIENCES.includes(raw) ? raw : (AUDIENCE_ALIASES[raw] ?? null);
}

// ---------- Syllables ----------

const SYLLABLE_EXCEPTIONS = Object.freeze({
  people: 2, rhythm: 2, business: 2, every: 2, everything: 3, evening: 2,
  something: 2, somewhere: 2, jewelry: 3, colonel: 2, wednesday: 2,
  vegetable: 4, comfortable: 4, temperature: 4, interesting: 4,
  literature: 4, chocolate: 2, camera: 2, family: 3, favorite: 3,
  average: 3, science: 2, quiet: 2, poem: 2, being: 2, doing: 2,
  going: 2, seeing: 2, idea: 3, area: 3, real: 2, create: 2, created: 3,
});

/**
 * Heuristic syllable count for one word. Non-alphabetic tokens (numbers,
 * standalone punctuation survivors) count as 1.
 *
 * @param {string} word
 * @returns {number} >= 1
 */
export function countSyllables(word) {
  const w = String(word ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 1;
  if (w in SYLLABLE_EXCEPTIONS) return SYLLABLE_EXCEPTIONS[w];

  const groups = w.match(/[aeiouy]+/g);
  if (!groups) return 1;
  let count = groups.length;

  // silent trailing 'e': "code" -> 1, but "-le" after a consonant keeps its
  // syllable ("simple" -> 2), and a bare "e" word ("the") is untouched.
  if (count > 1 && w.endsWith('e') && !/[^aeiou]le$/.test(w)) {
    count--;
  }
  return Math.max(1, count);
}

// ---------- Markdown stripping / segmentation ----------

const ABBREVIATIONS = [
  'e.g', 'i.e', 'vs', 'etc', 'cf', 'ca', 'approx', 'no', 'fig', 'eq',
  'mr', 'mrs', 'ms', 'dr', 'prof', 'jr', 'sr', 'st', 'mt', 'vol', 'pp',
  'u.s', 'u.k', 'd.c', 'a.m', 'p.m',
];
const ABBREV_RE = new RegExp(
  `\\b(${ABBREVIATIONS.map((a) => a.replace(/\./g, '\\.')).join('|')})\\.`,
  'gi'
);

/**
 * Classify and lightly clean the lines of a markdown document for prose
 * analysis. Headings and table cells are visible prose and are included;
 * code fences are excluded from FK calculations but counted when reporting
 * visible-text coverage so a document cannot hide most of its content there.
 *
 * @param {string} text
 * @returns {Array<{ line: number, text: string }>} kept prose lines, 1-indexed
 */
export function proseLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const kept = [];
  let inFence = false;
  let inFrontmatter = false;
  let inComment = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (i === 0 && trimmed === '---') { inFrontmatter = true; continue; }
    if (inFrontmatter) { if (trimmed === '---') inFrontmatter = false; continue; }

    if (inComment) { if (trimmed.includes('-->')) inComment = false; continue; }
    if (trimmed.startsWith('<!--')) { if (!trimmed.includes('-->')) inComment = true; continue; }

    if (/^(```|~~~)/.test(trimmed)) { inFence = !inFence; continue; }
    if (inFence) continue;

    if (!trimmed) { kept.push({ line: i + 1, text: '' }); continue; }
    if (/^[|:\s-]+$/.test(trimmed)) continue; // table delimiter / rule
    if (/^(---+|\*\*\*+|___+)\s*$/.test(trimmed)) continue;
    if (/^!\[[^\]]*\]\([^)]*\)\s*$/.test(trimmed)) continue; // image-only

    let t = trimmed
      .replace(/^#{1,6}\s+/, '')                           // heading text
      .replace(/^\||\|$/g, '')                            // table edges
      .replace(/\s*\|\s*/g, '. ')                        // table cells
      .replace(/^>\s?/, '')                                // blockquote
      .replace(/^(\s*)([-*+]|\d+[.)])\s+/, '')             // list markers
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')            // images w/ alt
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')             // links -> text
      .replace(/`([^`]*)`/g, '$1')                         // inline code
      .replace(/(\*\*|__|\*|_)(?=\S)([\s\S]*?\S)\1/g, '$2') // emphasis
      .replace(/\{\{[A-Z]{3}:[^}]*\}\}/g, '');             // citation tags

    kept.push({ line: i + 1, text: t, kind: /^#{1,6}\s/.test(trimmed) ? 'heading' : /^\|/.test(trimmed) ? 'table' : 'prose' });
  }
  return kept;
}

/**
 * Strip markdown syntax, returning plain prose text (paragraphs separated
 * by blank lines). Convenience wrapper over proseLines.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdown(text) {
  return proseLines(text).map((l) => l.text).join('\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Split prose into sentences. Abbreviation periods are protected; splits
 * happen after . ! ? followed by whitespace and an opening capital/quote.
 *
 * @param {string} prose
 * @returns {string[]}
 */
export function splitSentences(prose) {
  const protectedText = String(prose ?? '').replace(ABBREV_RE, (m) => m.replace(/\./g, '\u0001'));
  const parts = protectedText
    .split(/(?<=[.!?]["')”’]?)\s+(?=["'(“‘]?[A-Z0-9])/)
    .map((s) => s.replace(/\u0001/g, '.').trim())
    .filter((s) => s.length > 0);
  return parts;
}

const WORD_RE = /[A-Za-z0-9][A-Za-z0-9'’-]*/g;

function words(sentence) {
  return sentence.match(WORD_RE) ?? [];
}

// ---------- AI-tell candidate detection (flag, never auto-fail) ----------

const NEGATION_ANTITHESIS_RES = [
  // "This isn't coincidence. It's a pattern." / "It's not X. It's Y."
  /\b(?:is|are|was|were|do|does|did)\s*n[o'’]t\b[^.!?]{0,80}[.!?]\s+(?:It|This|That|They)(?:[’']s| is| are)\b/,
  // "not X, but Y" / "isn't just X but Y" pivot within one sentence
  // (n[’']t covers contractions: isn't/aren't/wasn't...)
  /(?:\bnot|n[’']t)\s+(?:about\s+|just\s+|only\s+)?[^.!?,]{2,60},?\s*but\b/i,
];

function findNegationAntithesis(keptLines) {
  const hits = [];
  // scan a sliding window of each line plus the next non-empty line, so the
  // two-sentence form split across lines is still caught
  for (let i = 0; i < keptLines.length; i++) {
    if (!keptLines[i].text) continue;
    let windowText = keptLines[i].text;
    if (i + 1 < keptLines.length && keptLines[i + 1].text) {
      windowText += ' ' + keptLines[i + 1].text;
    }
    for (const re of NEGATION_ANTITHESIS_RES) {
      const m = windowText.match(re);
      if (m) {
        hits.push({ line: keptLines[i].line, text: m[0].slice(0, 120) });
        break;
      }
    }
  }
  // dedupe overlapping window hits on adjacent lines reporting the same match
  return hits.filter((h, idx) => idx === 0 || h.text !== hits[idx - 1].text);
}

const TRICOLON_MAX_WORDS = 8;
const TRICOLON_MIN_RUN = 3;

function findTricolons(paragraphs) {
  const hits = [];
  for (const p of paragraphs) {
    let run = 0;
    let runStartIdx = 0;
    for (let i = 0; i < p.sentences.length; i++) {
      const w = words(p.sentences[i]).length;
      if (w > 0 && w <= TRICOLON_MAX_WORDS) {
        if (run === 0) runStartIdx = i;
        run++;
        if (run === TRICOLON_MIN_RUN) {
          hits.push({
            line: p.line,
            excerpt: p.sentences.slice(runStartIdx, i + 1).join(' ').slice(0, 160),
          });
        }
      } else {
        run = 0;
      }
    }
  }
  return hits;
}

// ---------- Acronyms ----------

const ACRONYM_RE = /\b[A-Z]{2,6}s?\b/g;
const ACRONYM_IGNORE = new Set([
  'OK', 'TV', 'US', 'UK', 'EU', 'AM', 'PM', 'ID', 'AI', 'IT', 'II', 'III',
  'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'NB', 'PS', 'QA', 'NYT', 'WSJ',
]);

function findAcronyms(keptLines) {
  const seen = new Map();
  for (const { line, text } of keptLines) {
    if (!text) continue;
    for (const m of text.matchAll(ACRONYM_RE)) {
      const acro = m[0].replace(/s$/, '');
      if (acro.length < 2 || ACRONYM_IGNORE.has(acro)) continue;
      if (seen.has(acro)) continue;
      const idx = m.index ?? 0;
      const beforeText = text.slice(0, idx);
      const afterText = text.slice(idx + m[0].length);
      const leftExpansion = beforeText.match(/([A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*){1,8})\s*\($/);
      const rightExpansion = afterText.match(/^\s*\(([^)]{3,100})\)/);
      const expansion = leftExpansion?.[1] ?? rightExpansion?.[1] ?? null;
      const initials = expansion
        ? (expansion.match(/\b[A-Za-z]/g) ?? []).join('').toUpperCase()
        : '';
      const defined = initials === acro || initials.endsWith(acro);
      seen.set(acro, { acronym: acro, first_use_line: line, defined });
    }
  }
  return [...seen.values()];
}

// ---------- Kill list ----------

// Typographic apostrophes/quotes must match their straight forms, or a
// polished draft's "Let's be honest" slips past a straight-quoted term.
function straightenQuotes(s) {
  return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

function findKillListHits(keptLines, killList) {
  if (!killList) return [];
  const terms = [
    ...(killList.words ?? []).map((term) => ({ term, type: 'word' })),
    ...(killList.phrases ?? []).map((term) => ({ term, type: 'phrase' })),
  ].filter((t) => typeof t.term === 'string' && t.term.trim());
  const hits = [];
  for (const { term, type } of terms) {
    const straight = straightenQuotes(term.trim());
    const re = new RegExp(`\\b${straight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const lines = [];
    let count = 0;
    for (const { line, text } of keptLines) {
      if (!text) continue;
      const matches = straightenQuotes(text).match(re);
      if (matches) { count += matches.length; lines.push(line); }
    }
    if (count > 0) hits.push({ word: term, type, count, lines });
  }
  return hits;
}

// ---------- Main analysis ----------

/**
 * Analyze a markdown document's readability and emit AI-tell candidates.
 *
 * @param {string} text markdown source
 * @param {{ audience?: 'default'|'general'|'expert', killList?: {words?: string[], phrases?: string[]}|null }} [opts]
 * @returns {object} full report; `pass` is always true for audience 'expert'
 */
export function analyzeReadability(text, opts = {}) {
  const audience = normalizeAudience(opts.audience) ?? 'default';
  const killList = opts.killList ?? null;
  const kept = proseLines(text);
  const rawLines = String(text ?? '').split(/\r?\n/);
  let visibleWordCount = 0;
  let inFenceForCoverage = false;
  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trim();
    if (/^(```|~~~)/.test(trimmed)) { inFenceForCoverage = !inFenceForCoverage; continue; }
    if (inFenceForCoverage) visibleWordCount += words(trimmed).length;
  }

  // paragraphs: runs of non-empty kept lines
  const paragraphs = [];
  let current = null;
  for (const l of kept) {
    if (!l.text) { current = null; continue; }
    if (!current) { current = { line: l.line, texts: [] }; paragraphs.push(current); }
    current.texts.push(l.text);
  }
  for (const p of paragraphs) {
    p.text = p.texts.join(' ');
    p.sentences = splitSentences(p.text);
    delete p.texts;
  }

  let wordCount = 0;
  let sentenceCount = 0;
  let syllableCount = 0;
  let maxSentenceWords = 0;
  const sentencesOverMax = [];
  const thresholds = audience in THRESHOLDS ? THRESHOLDS[audience] : THRESHOLDS.default;
  const maxWords = (thresholds ?? THRESHOLDS.default).maxSentenceWords;

  for (const p of paragraphs) {
    for (const s of p.sentences) {
      const ws = words(s);
      if (ws.length === 0) continue;
      sentenceCount++;
      wordCount += ws.length;
      for (const w of ws) syllableCount += countSyllables(w);
      if (ws.length > maxSentenceWords) {
        maxSentenceWords = ws.length;
      }
      if (ws.length > maxWords) {
        sentencesOverMax.push({ line: p.line, words: ws.length, text: s.slice(0, 160) });
      }
    }
  }

  const avgSentenceWords = sentenceCount > 0 ? wordCount / sentenceCount : 0;
  const fkGrade = sentenceCount > 0 && wordCount > 0
    ? 0.39 * (wordCount / sentenceCount) + 11.8 * (syllableCount / wordCount) - 15.59
    : 0;

  const violations = [];
  if (thresholds) {
    if (fkGrade > thresholds.fk) {
      violations.push(`fk_grade ${fkGrade.toFixed(1)} > ${thresholds.fk.toFixed(1)}`);
    }
    if (avgSentenceWords > thresholds.avgSentenceWords) {
      violations.push(`avg_sentence_words ${avgSentenceWords.toFixed(1)} > ${thresholds.avgSentenceWords}`);
    }
    for (const s of sentencesOverMax) {
      violations.push(`sentence >${thresholds.maxSentenceWords} words at line ${s.line} (${s.words} words)`);
    }
  }

  const tricolonHits = findTricolons(paragraphs);
  const negationHits = findNegationAntithesis(kept);
  const analyzedWordCoverage = (wordCount + visibleWordCount) > 0
    ? wordCount / (wordCount + visibleWordCount)
    : 1;
  if (analyzedWordCoverage < MIN_ANALYZED_COVERAGE) {
    violations.push(`analyzed_visible_word_coverage ${(analyzedWordCoverage * 100).toFixed(1)}% < ${(MIN_ANALYZED_COVERAGE * 100).toFixed(0)}%`);
  }

  // Power positions: the first two paragraphs and the final one. Emitted so
  // no LLM re-derives the line-to-paragraph mapping in-context; advisory
  // (never affects `pass`) — the skill decides what a hit here means.
  const powerPositionHits = [];
  if (paragraphs.length > 0) {
    const paragraphIndex = (line) => {
      for (let i = 0; i < paragraphs.length; i++) {
        const end = i + 1 < paragraphs.length ? paragraphs[i + 1].line - 1 : Infinity;
        if (line >= paragraphs[i].line && line <= end) return i;
      }
      return -1;
    };
    const last = paragraphs.length - 1;
    for (const [kind, arr] of [['negation_antithesis', negationHits], ['tricolon', tricolonHits]]) {
      for (const h of arr) {
        const idx = paragraphIndex(h.line);
        if (idx === 0 || idx === 1 || idx === last) {
          powerPositionHits.push({
            kind,
            line: h.line,
            paragraph: idx + 1,
            position: idx <= 1 ? 'opening' : 'final',
          });
        }
      }
    }
  }

  return {
    // Expert prose is exempt from grade/sentence-length ceilings, but not from
    // the minimum analyzed-visible-text coverage gate.
    pass: violations.length === 0,
    audience,
    fk_grade: Number(fkGrade.toFixed(2)),
    avg_sentence_words: Number(avgSentenceWords.toFixed(2)),
    max_sentence_words: maxSentenceWords,
    word_count: wordCount,
    excluded_visible_word_count: visibleWordCount,
    analyzed_visible_word_coverage: Number(analyzedWordCoverage.toFixed(4)),
    sentence_count: sentenceCount,
    syllable_count: syllableCount,
    sentences_over_max: sentencesOverMax,
    paragraphs: paragraphs.map((p) => ({
      line: p.line,
      words: p.sentences.reduce((n, s) => n + words(s).length, 0),
      sentences: p.sentences.length,
    })),
    tricolon_paragraphs: tricolonHits,
    negation_antithesis: negationHits,
    power_position_hits: powerPositionHits,
    acronyms: findAcronyms(kept),
    kill_list_hits: findKillListHits(kept, killList),
    violations,
  };
}
