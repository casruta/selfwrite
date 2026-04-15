// lib/validate.mjs
//
// Validators for the selfpost skill. Pure, deterministic checks on queue
// files and their frontmatter. The skill (selfpost.md) uses these via the
// forthcoming selfpost-q CLI (shelled out via Bash) so Claude doesn't have
// to recompute char counts, duplicate scores, or state transitions at
// runtime.
//
// All exported functions follow an error-as-value pattern: they return an
// object with a `valid` field plus details. Nothing throws. Callers decide
// whether a failure should warn, block, or mark the queue item failed.
//
// Dependencies (install via `npm install` in the repo root):
//   - twitter-text  (X's weighted-length algorithm for char counting)
//   - yaml          (frontmatter + config file parsing)
//
// The module has no default export.

import twitter from 'twitter-text';
import { parse as parseYaml } from 'yaml';

const { parseTweet } = twitter;

// ---------- Constants ----------

export const MAX_TWEET_CHARS = 280;
export const POSTING_HOURS_START = 8;   // 08:00 local (inclusive)
export const POSTING_HOURS_END = 22;    // 22:00 local (exclusive)
export const DAILY_CAP = 10;            // max posts per rolling 24h
export const DUPLICATE_THRESHOLD = 0.9; // Jaccard >= this ⇒ near-duplicate
export const DUPLICATE_LOOKBACK = 20;   // check against last N posted items

export const VALID_STATUSES = Object.freeze(['draft', 'ready', 'posted', 'failed', 'cancelled']);
export const VALID_TYPES = Object.freeze(['tweet', 'thread']);

// State machine: allowed transitions out of each status.
// posted and cancelled are terminal.
const STATUS_TRANSITIONS = Object.freeze({
  draft:     new Set(['ready', 'cancelled']),
  ready:     new Set(['posted', 'failed', 'cancelled', 'draft']),
  posted:    new Set([]),
  failed:    new Set(['ready', 'draft', 'cancelled']),
  cancelled: new Set([]),
});

const REQUIRED_FRONTMATTER_FIELDS = Object.freeze(['id', 'status', 'type', 'created']);
const ID_PATTERN = /^\d{8}-\d{4}-[a-z0-9][a-z0-9-]*[a-z0-9]$/;

// ---------- Character counting ----------

/**
 * Count weighted characters per X's algorithm: URLs count as 23, emoji as 2,
 * combining chars collapse, CJK weighted per spec.
 *
 * @param {string} body
 * @returns {number} weighted length
 */
export function countTweetChars(body) {
  if (typeof body !== 'string' || body.length === 0) return 0;
  const result = parseTweet(body);
  return result.weightedLength;
}

/**
 * Validate one section (tweet body or thread section) against the char cap.
 *
 * @param {string} section
 * @returns {{ valid: boolean, count: number, error?: string }}
 */
export function validateSectionLength(section) {
  const count = countTweetChars(section);
  if (count === 0) {
    return { valid: false, count, error: 'section is empty' };
  }
  if (count > MAX_TWEET_CHARS) {
    return { valid: false, count, error: `section exceeds ${MAX_TWEET_CHARS} chars (is ${count})` };
  }
  return { valid: true, count };
}

// ---------- Thread structure ----------

/**
 * Split a body into sections based on the type.
 *   - 'tweet': entire body is one section; `# N` headers are disallowed.
 *   - 'thread': sections delimited by `# 1`, `# 2`, ... headers.
 *
 * Validates that thread sections are numbered sequentially starting at 1,
 * no gaps, no duplicates.
 *
 * @param {string} body
 * @param {'tweet'|'thread'} type
 * @returns {{ valid: boolean, sections: string[], error?: string }}
 */
export function validateThreadStructure(body, type) {
  if (!VALID_TYPES.includes(type)) {
    return { valid: false, sections: [], error: `unknown type: ${type}` };
  }

  const trimmed = (body ?? '').trim();
  if (!trimmed) {
    return { valid: false, sections: [], error: 'body is empty' };
  }

  // tweet: no headers allowed
  if (type === 'tweet') {
    if (/^#\s+\d+\s*$/m.test(trimmed)) {
      return { valid: false, sections: [], error: "tweet body contains '# N' header; change type to 'thread' or remove headers" };
    }
    return { valid: true, sections: [trimmed] };
  }

  // thread: parse numbered headers
  const headerRegex = /^#\s+(\d+)\s*$/gm;
  const matches = [];
  let match;
  while ((match = headerRegex.exec(trimmed)) !== null) {
    matches.push({ num: Number(match[1]), index: match.index, length: match[0].length });
  }

  if (matches.length === 0) {
    return { valid: false, sections: [], error: "thread body has no '# N' section headers" };
  }

  // check sequential: 1, 2, 3, ...
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].num !== i + 1) {
      return {
        valid: false,
        sections: [],
        error: `thread sections must be sequential starting at 1; found '# ${matches[i].num}' at position ${i + 1}`,
      };
    }
  }

  // extract section bodies
  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + matches[i].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : trimmed.length;
    const section = trimmed.slice(start, end).trim();
    if (!section) {
      return {
        valid: false,
        sections: [],
        error: `section ${i + 1} is empty`,
      };
    }
    sections.push(section);
  }

  if (sections.length < 2) {
    return {
      valid: false,
      sections,
      error: "thread must have at least 2 sections; use type 'tweet' for a single post",
    };
  }

  return { valid: true, sections };
}

// ---------- Frontmatter ----------

/**
 * Parse a raw markdown file's YAML frontmatter and body.
 *
 * @param {string} rawText
 * @returns {{ frontmatter: object|null, body: string, error?: string }}
 */
export function parseYamlFrontmatter(rawText) {
  if (typeof rawText !== 'string') {
    return { frontmatter: null, body: '', error: 'input is not a string' };
  }

  const match = rawText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: null, body: rawText, error: 'no valid frontmatter block found' };
  }

  try {
    const frontmatter = parseYaml(match[1]);
    if (frontmatter === null || typeof frontmatter !== 'object') {
      return { frontmatter: null, body: match[2] ?? '', error: 'frontmatter is not an object' };
    }
    return { frontmatter, body: match[2] ?? '' };
  } catch (err) {
    return { frontmatter: null, body: match[2] ?? '', error: `YAML parse error: ${err.message}` };
  }
}

/**
 * Validate frontmatter required fields and value constraints.
 *
 * @param {object} frontmatter
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateFrontmatter(frontmatter) {
  const errors = [];

  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    return { valid: false, errors: ['frontmatter is not a plain object'] };
  }

  // required fields present
  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (!(field in frontmatter) || frontmatter[field] === null || frontmatter[field] === '') {
      errors.push(`missing required field: ${field}`);
    }
  }

  // status enum
  if ('status' in frontmatter && frontmatter.status != null) {
    if (!VALID_STATUSES.includes(frontmatter.status)) {
      errors.push(`invalid status: ${JSON.stringify(frontmatter.status)} (must be one of: ${VALID_STATUSES.join(', ')})`);
    }
  }

  // type enum
  if ('type' in frontmatter && frontmatter.type != null) {
    if (!VALID_TYPES.includes(frontmatter.type)) {
      errors.push(`invalid type: ${JSON.stringify(frontmatter.type)} (must be 'tweet' or 'thread')`);
    }
  }

  // id format
  if (typeof frontmatter.id === 'string' && frontmatter.id.length > 0) {
    if (!ID_PATTERN.test(frontmatter.id)) {
      errors.push(`id format invalid: expected YYYYMMDD-HHMM-<slug>, got ${JSON.stringify(frontmatter.id)}`);
    }
  }

  // created date parseable
  if (frontmatter.created != null) {
    const createdValue = frontmatter.created instanceof Date
      ? frontmatter.created.toISOString()
      : String(frontmatter.created);
    const createdMs = Date.parse(createdValue);
    if (Number.isNaN(createdMs)) {
      errors.push(`created is not a valid date: ${JSON.stringify(frontmatter.created)}`);
    } else if (createdMs > Date.now() + 60_000) {
      // allow 60s clock skew
      errors.push(`created is in the future: ${createdValue}`);
    }
  }

  // status/posted_at consistency
  if (frontmatter.status === 'posted') {
    if (!frontmatter.posted_at) {
      errors.push("status is 'posted' but posted_at is missing or null");
    }
  }
  if (frontmatter.status === 'draft' && frontmatter.posted_at) {
    errors.push("status is 'draft' but posted_at is set; posted_at should only be set on 'posted' items");
  }

  // posted_at after created
  if (frontmatter.posted_at && frontmatter.created) {
    const postedMs = Date.parse(
      frontmatter.posted_at instanceof Date ? frontmatter.posted_at.toISOString() : String(frontmatter.posted_at)
    );
    const createdMs = Date.parse(
      frontmatter.created instanceof Date ? frontmatter.created.toISOString() : String(frontmatter.created)
    );
    if (!Number.isNaN(postedMs) && !Number.isNaN(createdMs) && postedMs < createdMs) {
      errors.push('posted_at is before created');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that the id field matches the filename's stem.
 *
 * @param {string} id
 * @param {string} filename (e.g. "20260414-1030-topic.md")
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateIdMatchesFilename(id, filename) {
  if (typeof id !== 'string' || typeof filename !== 'string') {
    return { valid: false, error: 'id and filename must be strings' };
  }
  const stem = filename.replace(/\.md$/i, '');
  if (stem !== id) {
    return { valid: false, error: `id (${id}) does not match filename stem (${stem})` };
  }
  return { valid: true };
}

// ---------- Status transitions ----------

/**
 * Validate a status transition against the state machine.
 *
 * @param {string} oldStatus
 * @param {string} newStatus
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateStatusTransition(oldStatus, newStatus) {
  if (!VALID_STATUSES.includes(oldStatus)) {
    return { valid: false, error: `unknown current status: ${JSON.stringify(oldStatus)}` };
  }
  if (!VALID_STATUSES.includes(newStatus)) {
    return { valid: false, error: `unknown new status: ${JSON.stringify(newStatus)}` };
  }
  if (oldStatus === newStatus) {
    return { valid: true };
  }
  const allowed = STATUS_TRANSITIONS[oldStatus];
  if (!allowed.has(newStatus)) {
    const allowedList = [...allowed].join(', ') || 'none (terminal state)';
    return {
      valid: false,
      error: `cannot transition from '${oldStatus}' to '${newStatus}'; allowed next states: ${allowedList}`,
    };
  }
  return { valid: true };
}

// ---------- Duplicate detection ----------

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

/**
 * Check whether newBody is a near-duplicate of any item in postedItems.
 * Only the first DUPLICATE_LOOKBACK items are checked; caller should sort
 * by posted_at descending before calling.
 *
 * @param {string} newBody
 * @param {Array<{id: string, body: string}>} postedItems
 * @param {number} [threshold=DUPLICATE_THRESHOLD]
 * @returns {{ isDuplicate: boolean, matchedId?: string, similarity?: number }}
 */
export function checkDuplicate(newBody, postedItems, threshold = DUPLICATE_THRESHOLD) {
  const candidates = (postedItems ?? []).slice(0, DUPLICATE_LOOKBACK);
  let best = { similarity: 0, matchedId: null };
  for (const item of candidates) {
    if (!item || typeof item.body !== 'string') continue;
    const sim = jaccardBigramSimilarity(newBody, item.body);
    if (sim > best.similarity) {
      best = { similarity: sim, matchedId: item.id };
    }
    if (sim >= threshold) {
      return { isDuplicate: true, matchedId: item.id, similarity: sim };
    }
  }
  return { isDuplicate: false, similarity: best.similarity, matchedId: best.matchedId ?? undefined };
}

// ---------- Cadence ----------

/**
 * Check whether the daily posting cap would be exceeded.
 *
 * @param {Array<{posted_at?: string|null|Date}>} postedItems
 * @param {number} [cap=DAILY_CAP]
 * @param {Date|number} [now]
 * @returns {{ postsIn24h: number, canPost: boolean, error?: string }}
 */
export function checkCadence(postedItems, cap = DAILY_CAP, now = Date.now()) {
  const nowMs = typeof now === 'number' ? now : now.getTime();
  const windowStart = nowMs - 24 * 60 * 60 * 1000;

  const postsIn24h = (postedItems ?? [])
    .filter(it => it && it.posted_at)
    .map(it => {
      const val = it.posted_at instanceof Date ? it.posted_at.toISOString() : String(it.posted_at);
      return Date.parse(val);
    })
    .filter(t => !Number.isNaN(t) && t >= windowStart && t <= nowMs)
    .length;

  if (postsIn24h >= cap) {
    return {
      postsIn24h,
      canPost: false,
      error: `daily cap reached: ${postsIn24h} posts in last 24h (max ${cap})`,
    };
  }
  return { postsIn24h, canPost: true };
}

// ---------- Posting hours ----------

/**
 * Check whether a given time falls within the posting-hours window
 * (08:00 inclusive to 22:00 exclusive, local time).
 *
 * @param {Date|number|string} [now]
 * @returns {{ inWindow: boolean, hours: [number, number] }}
 */
export function validatePostingHours(now) {
  const d = now == null ? new Date() : new Date(now);
  const h = d.getHours();
  return {
    inWindow: h >= POSTING_HOURS_START && h < POSTING_HOURS_END,
    hours: [POSTING_HOURS_START, POSTING_HOURS_END],
  };
}

// ---------- Full suite ----------

/**
 * Run all applicable validators for the given stage.
 *
 * Stages:
 *   'new'        after /selfpost new wrote the file
 *   'ready'      user flipped status: draft -> ready
 *   'preflight'  about to post during /selfpost run
 *
 * @param {{ frontmatter: object, body: string }} file
 * @param {'new'|'ready'|'preflight'} stage
 * @param {Array<{id: string, body: string, posted_at?: string|null}>} [postedArchive]
 * @returns {{ valid: boolean, errors: string[], warnings: string[], checks: object }}
 */
export function runValidationSuite(file, stage, postedArchive = []) {
  const errors = [];
  const warnings = [];
  const checks = {};

  const frontmatter = file?.frontmatter ?? {};
  const body = file?.body ?? '';

  // always: frontmatter shape
  const fm = validateFrontmatter(frontmatter);
  checks.frontmatter = fm;
  if (!fm.valid) errors.push(...fm.errors);

  // always: thread structure + section lengths
  const structure = validateThreadStructure(body, frontmatter?.type);
  checks.structure = structure;
  if (!structure.valid && structure.error) {
    errors.push(structure.error);
  } else if (structure.sections.length > 0) {
    checks.sectionLengths = structure.sections.map((s, i) => ({
      section: i + 1,
      ...validateSectionLength(s),
    }));
    for (const sl of checks.sectionLengths) {
      if (!sl.valid && sl.error) errors.push(`section ${sl.section}: ${sl.error}`);
    }
  }

  // preflight only: duplicate, cadence, posting-hours
  if (stage === 'preflight') {
    const dup = checkDuplicate(body, postedArchive);
    checks.duplicate = dup;
    if (dup.isDuplicate) {
      errors.push(`near-duplicate of ${dup.matchedId} (similarity ${dup.similarity.toFixed(2)})`);
    }

    const cad = checkCadence(postedArchive);
    checks.cadence = cad;
    if (!cad.canPost && cad.error) errors.push(cad.error);

    const hours = validatePostingHours();
    checks.postingHours = hours;
    if (!hours.inWindow) {
      warnings.push(`outside posting hours (${hours.hours[0]}:00-${hours.hours[1]}:00 local)`);
    }
  }

  return { valid: errors.length === 0, errors, warnings, checks };
}
