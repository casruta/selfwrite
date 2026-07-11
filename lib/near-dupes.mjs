// lib/near-dupes.mjs
//
// Generic near-duplicate pair finder over JSON/JSONL record collections.
// Replaces two unimplementable prose mechanisms found in the ANALYSIS.md
// audit: the MinHash dedup spec in selfresearch.md (no execution path) and
// the passive "the causal-chain analyzer will notice" actor dedup in
// selfinvestigate.md. Uses the character-bigram Jaccard similarity from
// lib/validate.mjs.
//
// Output is advisory: the skill decides whether a pair is a true duplicate
// (merge) or a coincidence (keep). Error-as-value; nothing throws.

import { jaccardBigramSimilarity } from './validate.mjs';

export const DEFAULT_THRESHOLD = 0.85;

/**
 * Concatenate the configured fields of a record into one comparison string.
 * Array field values (e.g. aliases) are joined; missing fields are skipped.
 *
 * @param {object} record
 * @param {string[]} fields
 * @returns {string}
 */
export function comparisonText(record, fields) {
  const parts = [];
  for (const f of fields) {
    const v = record?.[f];
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) parts.push(v.filter((x) => typeof x === 'string').join(' '));
  }
  return parts.join(' ').trim();
}

/**
 * Find all record pairs whose field-concatenated text similarity meets the
 * threshold. O(n^2) — fine for the few-hundred-record collections these
 * skills produce.
 *
 * @param {object[]} records
 * @param {{ fields: string[], threshold?: number, idField?: string }} opts
 * @returns {{ ok: boolean, error?: string, pairs: Array<{a: string, b: string, similarity: number}>, count: number, compared: number }}
 */
export function nearDupePairs(records, opts = {}) {
  const fields = opts.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    return { ok: false, error: 'opts.fields must be a non-empty array', pairs: [], count: 0, compared: 0 };
  }
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : DEFAULT_THRESHOLD;
  const idField = opts.idField ?? null;

  const items = (records ?? [])
    .map((r, i) => ({
      id: String(idField ? r?.[idField] ?? `#${i}` : r?.source_id ?? r?.id ?? `#${i}`),
      text: comparisonText(r, fields),
    }))
    .filter((it) => it.text.length > 0);

  const pairs = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = jaccardBigramSimilarity(items[i].text, items[j].text);
      if (sim >= threshold) {
        pairs.push({ a: items[i].id, b: items[j].id, similarity: Number(sim.toFixed(2)) });
      }
    }
  }
  pairs.sort((x, y) => y.similarity - x.similarity);
  return { ok: true, pairs, count: pairs.length, compared: items.length };
}

/**
 * Parse a .json (array, or object with a single array value, or object map)
 * or .jsonl payload into a record array.
 *
 * @param {string} text
 * @param {boolean} isJsonl
 * @returns {{ records: object[]|null, error?: string }}
 */
export function parseRecords(text, isJsonl) {
  if (isJsonl) {
    const records = [];
    const lines = String(text ?? '').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        records.push(JSON.parse(line));
      } catch (err) {
        return { records: null, error: `line ${i + 1}: ${err.message}` };
      }
    }
    return { records };
  }
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { records: parsed };
    if (parsed && typeof parsed === 'object') {
      const arrays = Object.values(parsed).filter(Array.isArray);
      if (arrays.length === 1) return { records: arrays[0] };
      return { records: Object.entries(parsed).map(([k, v]) => ({ ...(v ?? {}), id: k })) };
    }
    return { records: null, error: 'JSON payload is not an array or object' };
  } catch (err) {
    return { records: null, error: err.message };
  }
}
