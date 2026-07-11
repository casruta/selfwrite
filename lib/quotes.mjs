// lib/quotes.mjs
//
// Verbatim quote verification for the selfresearch/selfinvestigate skills.
// Closes the fabrication escape hatch found in the ANALYSIS.md audit: the
// verifier previously never re-checked that a quote in quotes.jsonl is an
// actual substring of the stored source text in sources.json — this module
// makes that a deterministic string check the verifier shells out to
// (scripts/verify-quotes.mjs), with no semantic appeal.
//
// Error-as-value pattern throughout; nothing throws. No default export.

import { jaccardBigramSimilarity } from './validate.mjs';

const SOURCE_TEXT_FIELDS = Object.freeze(['abstract', 'snippet_used']);
const MIN_FRAGMENT_WORDS = 3;

/**
 * Normalize text for verbatim matching: NFKC, lowercase, curly quotes and
 * dashes straightened, soft hyphens removed, whitespace collapsed.
 *
 * @param {string} s
 * @returns {string}
 */
export function normalizeForMatch(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/­/g, '') // soft hyphen
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Split a quote on elision markers (… or ...), keeping fragments that are
 * substantial enough to check (>= MIN_FRAGMENT_WORDS words).
 *
 * @param {string} quoteText
 * @returns {string[]} normalized fragments
 */
export function elisionFragments(quoteText) {
  return String(quoteText ?? '')
    .split(/…|\.{3,}|\[…\]|\[\.{3}\]/)
    .map(normalizeForMatch)
    .filter((f) => f.split(' ').filter(Boolean).length >= MIN_FRAGMENT_WORDS || f.length >= 20);
}

/**
 * Check one quote against one source record. A quote is verbatim when every
 * elision fragment appears, in order, inside a single source text field
 * (abstract or snippet_used).
 *
 * @param {{ quote_text?: string }} quote
 * @param {{ abstract?: string, snippet_used?: string }} source
 * @returns {{ verbatim: boolean, field?: string, reason?: string, closest_match?: {field: string, similarity: number} }}
 */
export function verifyQuote(quote, source) {
  const quoteText = quote?.quote_text ?? '';
  if (!normalizeForMatch(quoteText)) {
    return { verbatim: false, reason: 'empty_quote_text' };
  }
  const fragments = elisionFragments(quoteText);
  if (fragments.length === 0) {
    return { verbatim: false, reason: 'quote_too_short_to_verify' };
  }

  const availableFields = SOURCE_TEXT_FIELDS.filter(
    (f) => typeof source?.[f] === 'string' && source[f].trim().length > 0
  );
  if (availableFields.length === 0) {
    return { verbatim: false, reason: 'empty_source_text' };
  }

  let best = { field: availableFields[0], similarity: 0 };
  for (const field of availableFields) {
    const haystack = normalizeForMatch(source[field]);
    let cursor = 0;
    let allFound = true;
    for (const frag of fragments) {
      const idx = haystack.indexOf(frag, cursor);
      if (idx === -1) { allFound = false; break; }
      cursor = idx + frag.length;
    }
    if (allFound) {
      return { verbatim: true, field };
    }
    const sim = bestWindowSimilarity(normalizeForMatch(quoteText), haystack);
    if (sim > best.similarity) best = { field, similarity: Number(sim.toFixed(2)) };
  }
  return { verbatim: false, reason: 'not_substring', closest_match: best };
}

/**
 * Max bigram-Jaccard similarity between a needle and any needle-sized window
 * of the haystack — so a lightly altered quote scores high against a long
 * abstract instead of being diluted by the surrounding text.
 *
 * @param {string} needle normalized quote text
 * @param {string} haystack normalized source text
 * @returns {number} in [0, 1]
 */
function bestWindowSimilarity(needle, haystack) {
  if (!needle || !haystack) return 0;
  const windowLen = Math.min(haystack.length, needle.length + 12);
  if (haystack.length <= windowLen) {
    return jaccardBigramSimilarity(needle, haystack);
  }
  const step = Math.max(5, Math.floor(needle.length / 4));
  let best = 0;
  for (let i = 0; i <= haystack.length - windowLen; i += step) {
    const sim = jaccardBigramSimilarity(needle, haystack.slice(i, i + windowLen));
    if (sim > best) best = sim;
  }
  return best;
}

/**
 * Parse a sources.json payload into a Map keyed by source id. Accepts an
 * array of records (id under `source_id` or `id`) or an object map.
 *
 * @param {string} sourcesJsonText
 * @returns {{ sources: Map<string, object>|null, error?: string }}
 */
export function parseSources(sourcesJsonText) {
  let parsed;
  try {
    parsed = JSON.parse(sourcesJsonText);
  } catch (err) {
    return { sources: null, error: `sources.json parse error: ${err.message}` };
  }
  const sources = new Map();
  const records = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.sources)
      ? parsed.sources
      : null;
  if (records) {
    for (const r of records) {
      const id = r?.source_id ?? r?.id;
      if (typeof id === 'string') sources.set(id, r);
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [id, r] of Object.entries(parsed)) {
      if (r && typeof r === 'object') sources.set(id, r);
    }
  } else {
    return { sources: null, error: 'sources.json is neither an array nor an object map' };
  }
  return { sources };
}

/**
 * Verify every quote in a quotes.jsonl payload against sources.json.
 *
 * @param {string} quotesJsonlText one JSON object per line
 * @param {string} sourcesJsonText
 * @returns {{ ok: boolean, error?: string, total: number, verbatim: number, pass: boolean,
 *             fabricated: Array<object>, missing_sources: string[], empty_source_text: string[],
 *             parse_errors: Array<{line: number, error: string}> }}
 */
export function verifyQuotesFile(quotesJsonlText, sourcesJsonText) {
  const base = {
    ok: true, total: 0, verbatim: 0, pass: true,
    fabricated: [], missing_sources: [], empty_source_text: [], parse_errors: [],
  };

  const { sources, error } = parseSources(sourcesJsonText);
  if (!sources) return { ...base, ok: false, pass: false, error };

  const lines = String(quotesJsonlText ?? '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let quote;
    try {
      quote = JSON.parse(line);
    } catch (err) {
      base.parse_errors.push({ line: i + 1, error: err.message });
      continue;
    }
    base.total++;
    const quoteId = quote?.quote_id ?? quote?.id ?? `line ${i + 1}`;
    const sourceId = quote?.source_id;

    if (typeof sourceId !== 'string' || !sources.has(sourceId)) {
      base.missing_sources.push(sourceId ?? quoteId);
      base.fabricated.push({ quote_id: quoteId, source_id: sourceId ?? null, reason: 'missing_source' });
      continue;
    }

    const result = verifyQuote(quote, sources.get(sourceId));
    if (result.verbatim) {
      base.verbatim++;
    } else if (result.reason === 'empty_source_text') {
      base.empty_source_text.push(quoteId);
      base.fabricated.push({ quote_id: quoteId, source_id: sourceId, reason: result.reason });
    } else {
      base.fabricated.push({
        quote_id: quoteId,
        source_id: sourceId,
        reason: result.reason,
        ...(result.closest_match ? { closest_match: result.closest_match } : {}),
      });
    }
  }

  base.pass = base.fabricated.length === 0 && base.parse_errors.length === 0;
  return base;
}
