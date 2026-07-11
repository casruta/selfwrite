// lib/validate.mjs
//
// Shared text-similarity helpers. `jaccardBigramSimilarity` backs both the
// quote verifier's closest-match reporting (lib/quotes.mjs) and near-duplicate
// detection over research records (lib/near-dupes.mjs).
//
// Error-as-value convention: nothing throws. No default export.

/**
 * Normalize text for similarity comparison: lowercase, collapse whitespace,
 * NFC unicode normalization.
 *
 * @param {string} s
 * @returns {string}
 */
function normalizeForSimilarity(s) {
  return (s ?? '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract a Set of character bigrams from normalized text.
 *
 * @param {string} s
 * @returns {Set<string>}
 */
function extractBigrams(s) {
  const bigrams = new Set();
  if (s.length < 2) {
    if (s.length === 1) bigrams.add(s);
    return bigrams;
  }
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.slice(i, i + 2));
  }
  return bigrams;
}

/**
 * Compute Jaccard similarity on character bigrams, in [0, 1].
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function jaccardBigramSimilarity(a, b) {
  const normA = normalizeForSimilarity(a);
  const normB = normalizeForSimilarity(b);
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;

  const bigramsA = extractBigrams(normA);
  const bigramsB = extractBigrams(normB);

  let intersection = 0;
  for (const g of bigramsA) {
    if (bigramsB.has(g)) intersection++;
  }
  const union = bigramsA.size + bigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
