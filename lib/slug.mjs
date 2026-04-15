// lib/slug.mjs
//
// Deterministic slug + id generation for queue filenames. Replaces the
// skill's "pick 2-4 lowercase words from the topic" prose rule, which
// produced a different slug every run. Same topic in → same slug out.
//
// Slug format: lowercase letters, digits, hyphens. 2-4 content words
// separated by hyphens, max 40 chars. Stopwords dropped unless the
// topic is entirely stopwords (fall back to first words).
//
// Id format: YYYYMMDD-HHMM-<slug>, where date/time is local time.

// ---------- Constants ----------

export const MAX_SLUG_LENGTH = 40;
export const MIN_SLUG_WORDS = 2;
export const MAX_SLUG_WORDS = 4;

// Short English stopword list. Not exhaustive — the goal is to drop the
// most common filler so a topic like "the quick brown fox" becomes
// "quick-brown-fox", not "the-quick-brown".
const STOPWORDS = new Set([
  'a', 'an', 'the',
  'and', 'or', 'but', 'nor', 'for', 'yet', 'so',
  'of', 'in', 'on', 'at', 'to', 'from', 'with', 'by', 'about', 'as',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'this', 'that', 'these', 'those',
  'my', 'your', 'our', 'their', 'its', 'his', 'her',
  'i', 'we', 'you', 'they',
  'do', 'does', 'did', 'will', 'would', 'can', 'could', 'should',
  'not', 'no',
]);

// ---------- Core slugify ----------

/**
 * Turn a topic string into a URL-safe, deterministic slug.
 *
 *   "AI Writing Loop"                   -> "ai-writing-loop"
 *   "The Quick Brown Fox"               -> "quick-brown-fox"
 *   "Detection: research & findings"    -> "detection-research-findings"
 *   ""                                  -> "untitled"
 *
 * @param {string} topic
 * @param {object} [opts]
 * @param {number} [opts.minWords=MIN_SLUG_WORDS]
 * @param {number} [opts.maxWords=MAX_SLUG_WORDS]
 * @param {number} [opts.maxLength=MAX_SLUG_LENGTH]
 * @returns {string}
 */
export function slugify(topic, opts = {}) {
  const minWords = opts.minWords ?? MIN_SLUG_WORDS;
  const maxWords = opts.maxWords ?? MAX_SLUG_WORDS;
  const maxLength = opts.maxLength ?? MAX_SLUG_LENGTH;

  if (typeof topic !== 'string' || !topic.trim()) {
    return 'untitled';
  }

  // normalize, strip diacritics, lowercase, keep only [a-z0-9 ]
  const normalized = topic
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 'untitled';

  const words = normalized.split(' ').filter(Boolean);
  if (words.length === 0) return 'untitled';

  // drop stopwords, but fall back to including them if nothing's left
  let content = words.filter(w => !STOPWORDS.has(w));
  if (content.length < minWords) {
    content = words; // fallback: use all words including stopwords
  }

  // take up to maxWords
  let picked = content.slice(0, maxWords);

  // assemble, then truncate to maxLength without creating a trailing hyphen
  let slug = picked.join('-');
  if (slug.length > maxLength) {
    // trim back to last full word under the limit
    const truncated = slug.slice(0, maxLength);
    const lastHyphen = truncated.lastIndexOf('-');
    slug = lastHyphen > 0 ? truncated.slice(0, lastHyphen) : truncated;
  }

  // final safety: strip leading/trailing hyphens, collapse doubles
  slug = slug.replace(/^-+|-+$/g, '').replace(/-+/g, '-');

  return slug || 'untitled';
}

// ---------- ID generation ----------

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format a Date into YYYYMMDD-HHMM using local time.
 *
 * @param {Date} d
 * @returns {string}
 */
export function formatDateTimePrefix(d) {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hours = pad2(d.getHours());
  const minutes = pad2(d.getMinutes());
  return `${year}${month}${day}-${hours}${minutes}`;
}

/**
 * Generate a queue-file id from a topic and timestamp.
 * Shape: YYYYMMDD-HHMM-<slug>.
 *
 * @param {string} topic
 * @param {Date} [now=new Date()]
 * @param {object} [opts]  passed to slugify
 * @returns {string}
 */
export function generateId(topic, now = new Date(), opts = {}) {
  const prefix = formatDateTimePrefix(now);
  const slug = slugify(topic, opts);
  return `${prefix}-${slug}`;
}
