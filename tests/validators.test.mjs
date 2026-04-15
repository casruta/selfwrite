// tests/validators.test.mjs
//
// Vitest suite for lib/validate.mjs. Seeded from the 40-case edge matrix
// produced by the Challenger-EdgeCases agent during Fix #2 research.
// Run via `npm test` at the repo root.

import { describe, it, expect } from 'vitest';
import {
  MAX_TWEET_CHARS,
  DAILY_CAP,
  VALID_STATUSES,
  VALID_TYPES,
  countTweetChars,
  validateSectionLength,
  validateThreadStructure,
  parseYamlFrontmatter,
  validateFrontmatter,
  validateIdMatchesFilename,
  validateStatusTransition,
  jaccardBigramSimilarity,
  checkDuplicate,
  checkCadence,
  validatePostingHours,
  runValidationSuite,
} from '../lib/validate.mjs';

// ------------------------------------------------------------------
// countTweetChars / validateSectionLength — X's weighted-length rules
// ------------------------------------------------------------------

describe('countTweetChars', () => {
  it('counts plain ASCII as code-point count', () => {
    expect(countTweetChars('hello')).toBe(5);
  });

  it('returns 0 for empty string', () => {
    expect(countTweetChars('')).toBe(0);
  });

  it('returns 0 for non-string inputs', () => {
    expect(countTweetChars(null)).toBe(0);
    expect(countTweetChars(undefined)).toBe(0);
    expect(countTweetChars(42)).toBe(0);
  });

  it('treats any URL as 23 chars regardless of actual length', () => {
    const shortUrl = countTweetChars('a https://t.co/x');
    const longUrl = countTweetChars('a https://example.com/very/long/path?with=params&more=stuff');
    // both URLs weight to 23; prefix "a " is 2 chars
    expect(shortUrl).toBe(25);
    expect(longUrl).toBe(25);
  });

  it('counts emoji as 2 weighted chars', () => {
    expect(countTweetChars('😀')).toBe(2);
  });

  it('counts a mention literally (not shortened)', () => {
    expect(countTweetChars('@user hello')).toBe(11);
  });

  it('counts a hashtag literally', () => {
    expect(countTweetChars('#topic here')).toBe(11);
  });
});

describe('validateSectionLength', () => {
  it('passes at exactly MAX_TWEET_CHARS', () => {
    const r = validateSectionLength('a'.repeat(MAX_TWEET_CHARS));
    expect(r.valid).toBe(true);
    expect(r.count).toBe(MAX_TWEET_CHARS);
  });

  it('fails at MAX_TWEET_CHARS + 1', () => {
    const r = validateSectionLength('a'.repeat(MAX_TWEET_CHARS + 1));
    expect(r.valid).toBe(false);
    expect(r.error).toContain('exceeds');
  });

  it('passes below the limit', () => {
    expect(validateSectionLength('short').valid).toBe(true);
  });

  it('fails on empty string', () => {
    const r = validateSectionLength('');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('empty');
  });
});

// ------------------------------------------------------------------
// validateThreadStructure — tweet vs thread, sequential numbering
// ------------------------------------------------------------------

describe('validateThreadStructure', () => {
  it('accepts a plain tweet', () => {
    const r = validateThreadStructure('just a tweet', 'tweet');
    expect(r.valid).toBe(true);
    expect(r.sections).toEqual(['just a tweet']);
  });

  it('rejects a tweet body that contains thread headers', () => {
    const r = validateThreadStructure('# 1\n\nwhoops', 'tweet');
    expect(r.valid).toBe(false);
  });

  it('accepts a 3-section thread', () => {
    const body = '# 1\n\nfirst section.\n\n# 2\n\nsecond section.\n\n# 3\n\nthird section.';
    const r = validateThreadStructure(body, 'thread');
    expect(r.valid).toBe(true);
    expect(r.sections).toHaveLength(3);
    expect(r.sections[0]).toBe('first section.');
  });

  it('rejects thread with only one numbered section', () => {
    const body = '# 1\n\nonly one';
    const r = validateThreadStructure(body, 'thread');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('at least 2 sections');
  });

  it('rejects non-sequential thread numbering (1, 3)', () => {
    const body = '# 1\n\nfirst\n\n# 3\n\nthird';
    const r = validateThreadStructure(body, 'thread');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('sequential');
  });

  it('rejects thread starting at # 2', () => {
    const body = '# 2\n\nbad\n\n# 3\n\nworse';
    const r = validateThreadStructure(body, 'thread');
    expect(r.valid).toBe(false);
  });

  it('rejects duplicate section numbers', () => {
    const body = '# 1\n\nfirst\n\n# 1\n\nduplicate';
    const r = validateThreadStructure(body, 'thread');
    expect(r.valid).toBe(false);
  });

  it('rejects thread with empty section', () => {
    const body = '# 1\n\nfirst\n\n# 2\n\n\n# 3\n\nthird';
    const r = validateThreadStructure(body, 'thread');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('section 2');
  });

  it('rejects empty body', () => {
    expect(validateThreadStructure('', 'tweet').valid).toBe(false);
    expect(validateThreadStructure('   ', 'thread').valid).toBe(false);
  });

  it('rejects unknown type', () => {
    const r = validateThreadStructure('text', 'essay');
    expect(r.valid).toBe(false);
    expect(r.error).toContain('unknown type');
  });
});

// ------------------------------------------------------------------
// parseYamlFrontmatter
// ------------------------------------------------------------------

describe('parseYamlFrontmatter', () => {
  it('parses valid frontmatter + body', () => {
    const raw = '---\nstatus: ready\ntype: tweet\n---\n\nbody here';
    const r = parseYamlFrontmatter(raw);
    expect(r.frontmatter.status).toBe('ready');
    expect(r.body.trim()).toBe('body here');
    expect(r.error).toBeUndefined();
  });

  it('handles Windows line endings (CRLF)', () => {
    const raw = '---\r\nstatus: ready\r\ntype: tweet\r\n---\r\n\r\nbody';
    const r = parseYamlFrontmatter(raw);
    expect(r.frontmatter.status).toBe('ready');
  });

  it('returns error when no frontmatter block', () => {
    const r = parseYamlFrontmatter('just a plain file');
    expect(r.frontmatter).toBeNull();
    expect(r.error).toContain('no valid frontmatter');
  });

  it('returns error for malformed YAML', () => {
    const raw = "---\nstatus: [unclosed\n---\n\nbody";
    const r = parseYamlFrontmatter(raw);
    expect(r.frontmatter).toBeNull();
    expect(r.error).toContain('YAML');
  });

  it('rejects frontmatter that parses to a non-object', () => {
    const raw = "---\njust a string\n---\n\nbody";
    const r = parseYamlFrontmatter(raw);
    // "just a string" parses as a string, not an object
    expect(r.frontmatter).toBeNull();
    expect(r.error).toContain('not an object');
  });

  it('returns error for non-string input', () => {
    expect(parseYamlFrontmatter(null).error).toBeDefined();
    expect(parseYamlFrontmatter(42).error).toBeDefined();
  });
});

// ------------------------------------------------------------------
// validateFrontmatter
// ------------------------------------------------------------------

describe('validateFrontmatter', () => {
  const ok = () => ({
    id: '20260414-1030-test-slug',
    status: 'ready',
    type: 'tweet',
    created: '2026-04-14T10:30:00',
  });

  it('accepts a complete valid frontmatter', () => {
    expect(validateFrontmatter(ok()).valid).toBe(true);
  });

  it('flags every missing required field', () => {
    const r = validateFrontmatter({});
    expect(r.valid).toBe(false);
    for (const field of ['id', 'status', 'type', 'created']) {
      expect(r.errors.some(e => e.includes(field))).toBe(true);
    }
  });

  it('rejects an invalid status', () => {
    const fm = { ...ok(), status: 'Ready' }; // wrong case
    const r = validateFrontmatter(fm);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('status'))).toBe(true);
  });

  it('rejects an invalid type', () => {
    const r = validateFrontmatter({ ...ok(), type: 'essay' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('type'))).toBe(true);
  });

  it('rejects bad id format', () => {
    const r = validateFrontmatter({ ...ok(), id: 'no-good' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('id format'))).toBe(true);
  });

  it('rejects unparseable created date', () => {
    const r = validateFrontmatter({ ...ok(), created: 'not-a-date' });
    expect(r.valid).toBe(false);
  });

  it('rejects a future created date', () => {
    const r = validateFrontmatter({ ...ok(), created: '2099-01-01T00:00:00' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('future'))).toBe(true);
  });

  it('rejects status=posted with missing posted_at', () => {
    const r = validateFrontmatter({ ...ok(), status: 'posted' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('posted_at'))).toBe(true);
  });

  it('accepts status=posted with a valid posted_at', () => {
    const r = validateFrontmatter({
      ...ok(),
      status: 'posted',
      posted_at: '2026-04-14T11:00:00',
    });
    expect(r.valid).toBe(true);
  });

  it('rejects draft with posted_at set', () => {
    const r = validateFrontmatter({
      ...ok(),
      status: 'draft',
      posted_at: '2026-04-14T11:00:00',
    });
    expect(r.valid).toBe(false);
  });

  it('rejects posted_at before created', () => {
    const r = validateFrontmatter({
      ...ok(),
      status: 'posted',
      created: '2026-04-14T12:00:00',
      posted_at: '2026-04-14T10:00:00',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('before created'))).toBe(true);
  });

  it('rejects arrays passed as frontmatter', () => {
    expect(validateFrontmatter([1, 2, 3]).valid).toBe(false);
  });

  it('rejects null frontmatter', () => {
    expect(validateFrontmatter(null).valid).toBe(false);
  });
});

// ------------------------------------------------------------------
// validateIdMatchesFilename
// ------------------------------------------------------------------

describe('validateIdMatchesFilename', () => {
  it('accepts a matching pair', () => {
    const r = validateIdMatchesFilename('20260414-1030-topic', '20260414-1030-topic.md');
    expect(r.valid).toBe(true);
  });

  it('rejects a mismatch', () => {
    const r = validateIdMatchesFilename('20260414-1030-topic', '20260414-1600-topic.md');
    expect(r.valid).toBe(false);
  });
});

// ------------------------------------------------------------------
// validateStatusTransition — state machine
// ------------------------------------------------------------------

describe('validateStatusTransition', () => {
  it('allows draft -> ready', () => {
    expect(validateStatusTransition('draft', 'ready').valid).toBe(true);
  });

  it('allows ready -> posted', () => {
    expect(validateStatusTransition('ready', 'posted').valid).toBe(true);
  });

  it('allows ready -> failed', () => {
    expect(validateStatusTransition('ready', 'failed').valid).toBe(true);
  });

  it('allows failed -> ready (retry path)', () => {
    expect(validateStatusTransition('failed', 'ready').valid).toBe(true);
  });

  it('rejects posted -> anything (terminal)', () => {
    expect(validateStatusTransition('posted', 'ready').valid).toBe(false);
    expect(validateStatusTransition('posted', 'draft').valid).toBe(false);
    expect(validateStatusTransition('posted', 'cancelled').valid).toBe(false);
  });

  it('rejects cancelled -> anything (terminal)', () => {
    expect(validateStatusTransition('cancelled', 'draft').valid).toBe(false);
  });

  it('allows same-status (no-op)', () => {
    for (const s of VALID_STATUSES) {
      expect(validateStatusTransition(s, s).valid).toBe(true);
    }
  });

  it('rejects unknown statuses', () => {
    expect(validateStatusTransition('draft', 'Ready').valid).toBe(false); // wrong case
    expect(validateStatusTransition('Draft', 'ready').valid).toBe(false);
    expect(validateStatusTransition('', 'ready').valid).toBe(false);
  });
});

// ------------------------------------------------------------------
// jaccardBigramSimilarity
// ------------------------------------------------------------------

describe('jaccardBigramSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardBigramSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely disjoint strings', () => {
    expect(jaccardBigramSimilarity('abcd', 'wxyz')).toBe(0);
  });

  it('treats both-empty as identical (1)', () => {
    expect(jaccardBigramSimilarity('', '')).toBe(1);
  });

  it('returns 0 when one side is empty', () => {
    expect(jaccardBigramSimilarity('hello', '')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(jaccardBigramSimilarity('HELLO', 'hello')).toBe(1);
  });

  it('normalizes NFC unicode', () => {
    // "é" as single codepoint vs. "e" + combining acute
    const a = '\u00e9';          // é (NFC)
    const b = 'e\u0301';         // é (NFD)
    expect(jaccardBigramSimilarity(a, b)).toBe(1);
  });

  it('gives a partial score for overlapping phrases', () => {
    const s = jaccardBigramSimilarity('the quick brown fox', 'the quick brown dog');
    expect(s).toBeGreaterThan(0.5);
    expect(s).toBeLessThan(1);
  });

  it('is symmetric', () => {
    expect(jaccardBigramSimilarity('abc', 'abcd')).toBe(jaccardBigramSimilarity('abcd', 'abc'));
  });
});

// ------------------------------------------------------------------
// checkDuplicate
// ------------------------------------------------------------------

describe('checkDuplicate', () => {
  it('flags an exact match', () => {
    const r = checkDuplicate('hello world', [{ id: 'prior', body: 'hello world' }]);
    expect(r.isDuplicate).toBe(true);
    expect(r.matchedId).toBe('prior');
  });

  it('does not flag disjoint content', () => {
    const r = checkDuplicate('completely new text', [{ id: 'prior', body: 'totally different' }]);
    expect(r.isDuplicate).toBe(false);
  });

  it('respects the threshold parameter', () => {
    const a = 'the quick brown fox jumps over';
    const b = 'the quick brown fox jumps high';
    const high = checkDuplicate(a, [{ id: 'p', body: b }], 0.99);
    const low = checkDuplicate(a, [{ id: 'p', body: b }], 0.3);
    expect(high.isDuplicate).toBe(false);
    expect(low.isDuplicate).toBe(true);
  });

  it('only checks the first 20 entries of the archive', () => {
    const old = Array.from({ length: 20 }, (_, i) => ({ id: `old${i}`, body: 'unique filler' + i }));
    const tooOld = { id: 'buried', body: 'hello world' };
    const archive = [...old, tooOld];
    const r = checkDuplicate('hello world', archive);
    expect(r.isDuplicate).toBe(false);
  });

  it('handles an empty archive', () => {
    const r = checkDuplicate('anything', []);
    expect(r.isDuplicate).toBe(false);
  });

  it('skips malformed archive entries', () => {
    const archive = [null, undefined, { id: 'ok', body: 'hello world' }];
    const r = checkDuplicate('hello world', archive);
    expect(r.isDuplicate).toBe(true);
    expect(r.matchedId).toBe('ok');
  });
});

// ------------------------------------------------------------------
// checkCadence — rolling 24h daily cap
// ------------------------------------------------------------------

describe('checkCadence', () => {
  const now = Date.now();
  const recent = (minutesAgo) => new Date(now - minutesAgo * 60_000).toISOString();

  it('allows posting below the cap', () => {
    const archive = [{ posted_at: recent(60) }];
    const r = checkCadence(archive, DAILY_CAP, now);
    expect(r.canPost).toBe(true);
    expect(r.postsIn24h).toBe(1);
  });

  it('blocks posting at the cap', () => {
    const archive = Array.from({ length: DAILY_CAP }, () => ({ posted_at: recent(60) }));
    const r = checkCadence(archive, DAILY_CAP, now);
    expect(r.canPost).toBe(false);
    expect(r.postsIn24h).toBe(DAILY_CAP);
  });

  it('ignores posts older than 24h', () => {
    const archive = Array.from({ length: 50 }, () => ({ posted_at: recent(25 * 60) }));
    const r = checkCadence(archive, DAILY_CAP, now);
    expect(r.canPost).toBe(true);
    expect(r.postsIn24h).toBe(0);
  });

  it('handles missing or malformed posted_at gracefully', () => {
    const archive = [
      { posted_at: null },
      { posted_at: 'not-a-date' },
      {},
      { posted_at: recent(10) },
    ];
    const r = checkCadence(archive, DAILY_CAP, now);
    expect(r.postsIn24h).toBe(1);
  });

  it('allows an explicit cap override', () => {
    const archive = Array.from({ length: 3 }, () => ({ posted_at: recent(1) }));
    expect(checkCadence(archive, 5, now).canPost).toBe(true);
    expect(checkCadence(archive, 3, now).canPost).toBe(false);
  });
});

// ------------------------------------------------------------------
// validatePostingHours — local clock 08:00–22:00
// ------------------------------------------------------------------

describe('validatePostingHours', () => {
  it('is in-window at 10:00', () => {
    const d = new Date();
    d.setHours(10, 0, 0, 0);
    expect(validatePostingHours(d).inWindow).toBe(true);
  });

  it('is in-window at 08:00 (inclusive)', () => {
    const d = new Date();
    d.setHours(8, 0, 0, 0);
    expect(validatePostingHours(d).inWindow).toBe(true);
  });

  it('is out-of-window at 22:00 (exclusive)', () => {
    const d = new Date();
    d.setHours(22, 0, 0, 0);
    expect(validatePostingHours(d).inWindow).toBe(false);
  });

  it('is out-of-window at 03:00', () => {
    const d = new Date();
    d.setHours(3, 0, 0, 0);
    expect(validatePostingHours(d).inWindow).toBe(false);
  });

  it('returns the window bounds', () => {
    expect(validatePostingHours().hours).toEqual([8, 22]);
  });
});

// ------------------------------------------------------------------
// runValidationSuite — integration across stages
// ------------------------------------------------------------------

describe('runValidationSuite', () => {
  const validTweetFile = () => ({
    frontmatter: {
      id: '20260414-1030-ok',
      status: 'ready',
      type: 'tweet',
      created: '2026-04-14T10:30:00',
    },
    body: 'a short valid tweet.',
  });

  it('passes a clean ready tweet at preflight', () => {
    const r = runValidationSuite(validTweetFile(), 'preflight', []);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('reports char-count failure', () => {
    const file = validTweetFile();
    file.body = 'a'.repeat(MAX_TWEET_CHARS + 1);
    const r = runValidationSuite(file, 'preflight', []);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('exceeds'))).toBe(true);
  });

  it('flags a duplicate', () => {
    const file = validTweetFile();
    file.body = 'exactly the same text as a prior post';
    const archive = [{ id: 'prior', body: 'exactly the same text as a prior post' }];
    const r = runValidationSuite(file, 'preflight', archive);
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => e.includes('near-duplicate'))).toBe(true);
  });

  it('does not flag a duplicate at the new stage (skipped)', () => {
    const file = validTweetFile();
    file.body = 'exactly the same text as a prior post';
    const archive = [{ id: 'prior', body: 'exactly the same text as a prior post' }];
    const r = runValidationSuite(file, 'new', archive);
    expect(r.valid).toBe(true); // duplicate guard only runs at preflight
  });

  it('collects multiple errors at once', () => {
    const file = {
      frontmatter: { id: 'bad-id', status: 'weird', type: 'essay', created: 'not-a-date' },
      body: '',
    };
    const r = runValidationSuite(file, 'preflight', []);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(2);
  });

  it('still runs frontmatter/structure checks when postedArchive omitted', () => {
    const r = runValidationSuite(validTweetFile(), 'preflight');
    expect(r.checks.frontmatter.valid).toBe(true);
  });
});

// ------------------------------------------------------------------
// Sanity: exported constants match skill documentation
// ------------------------------------------------------------------

describe('exports sanity', () => {
  it('MAX_TWEET_CHARS is 280 per X rules', () => {
    expect(MAX_TWEET_CHARS).toBe(280);
  });

  it('DAILY_CAP is 10 per selfpost skill', () => {
    expect(DAILY_CAP).toBe(10);
  });

  it('VALID_STATUSES covers the whole state machine', () => {
    expect(VALID_STATUSES).toEqual(['draft', 'ready', 'posted', 'failed', 'cancelled']);
  });

  it('VALID_TYPES covers tweet and thread', () => {
    expect(VALID_TYPES).toEqual(['tweet', 'thread']);
  });
});
